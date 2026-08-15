import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import {
  toLinkId,
  withDerivedStatus,
  type Link,
  type TelemetrySample,
} from '@linkops/shared/domain';
import {
  LINK_REPOSITORY,
  type LinkRecord,
  type LinkRepository,
} from '@linkops/server/links-data-access';
import { TELEMETRY_PORT, type TelemetryPort } from '@linkops/server/telemetry';
import { ApiErrorEnvelopeDto } from './dto/api-error-envelope.dto';
import { LinkCreateDto } from './dto/link-create.dto';
import { LinkDto } from './dto/link.dto';
import { LinkListQueryDto } from './dto/link-list-query.dto';
import { LinkPatchDto } from './dto/link-patch.dto';
import { LinkWithLatestSampleDto } from './dto/link-with-latest-sample.dto';
import { TelemetrySampleDto } from './dto/telemetry-sample.dto';
import { TelemetryWindowQueryDto } from './dto/telemetry-window-query.dto';
import { LinkNameTakenError } from './errors/link-name-taken.error';
import { LinkNotFoundError } from './errors/link-not-found.error';
import { LinkVersionConflictError } from './errors/link-version-conflict.error';
import { sortLinks, type SortableLink } from './sort-links';

@Controller('links')
export class LinksController {
  constructor(
    @Inject(LINK_REPOSITORY) private readonly repository: LinkRepository,
    @Inject(TELEMETRY_PORT) private readonly telemetry: TelemetryPort,
  ) {}

  @Get()
  @ZodResponse({ status: 200, type: [LinkDto] })
  @ApiResponse({
    status: 400,
    type: ApiErrorEnvelopeDto,
    description:
      'VALIDATION_FAILED — an unknown `sort` key, an invalid `dir`, `status` or `band` value',
  })
  findAll(@Query() query: LinkListQueryDto): Link[] {
    const now = new Date();

    // band and q are filtered here, inside the repository — they are fields
    // it owns. status is not: it is derived from Samples the repository has
    // never seen, so filtering on it, like sorting on it or on
    // throughputMbps, happens above the repository, once Telemetry has
    // supplied the Sample each Link's status and throughput come from.
    const entries = this.repository
      .findAll({ band: query.band, q: query.q })
      .map((record) => this.toSortableEntry(record, now))
      .filter(
        (entry) =>
          query.status === undefined ||
          entry.link.status.status === query.status,
      );

    return sortLinks(entries, query.sort, query.dir).map((entry) => entry.link);
  }

  @Get(':id')
  @ZodResponse({ status: 200, type: LinkWithLatestSampleDto })
  @ApiResponse({ status: 404, type: ApiErrorEnvelopeDto })
  findOne(@Param('id') id: string): {
    link: Link;
    latestSample: TelemetrySample | null;
  } {
    const linkId = toLinkId(id);
    const record = this.repository.findById(linkId);

    if (record === undefined) {
      throw new LinkNotFoundError(id);
    }

    const latestSample = this.telemetry.latestSample(linkId);

    return {
      link: withDerivedStatus(record, latestSample, new Date()),
      latestSample,
    };
  }

  @Get(':id/telemetry')
  @ZodResponse({ status: 200, type: [TelemetrySampleDto] })
  @ApiResponse({
    status: 400,
    type: ApiErrorEnvelopeDto,
    description: 'VALIDATION_FAILED — an unparseable `window`',
  })
  @ApiResponse({ status: 404, type: ApiErrorEnvelopeDto })
  history(
    @Param('id') id: string,
    @Query() query: TelemetryWindowQueryDto,
  ): TelemetrySample[] {
    const linkId = toLinkId(id);

    // Existence is a Roster question, answered by the repository — the
    // Samples themselves never come from it. An unknown Link is 404 before
    // the port is asked for anything.
    if (this.repository.findById(linkId) === undefined) {
      throw new LinkNotFoundError(id);
    }

    // `@ZodResponse`'s array overload wants a mutable array, and a copy
    // here is cheap insurance against a caller mutating the port's own
    // buffer through the response value.
    return [...this.telemetry.history(linkId, query.windowMs)];
  }

  @Post()
  @ZodResponse({ status: 201, type: LinkDto })
  @ApiResponse({
    status: 400,
    type: ApiErrorEnvelopeDto,
    description: 'VALIDATION_FAILED — a field outside its documented range',
  })
  @ApiResponse({
    status: 409,
    type: ApiErrorEnvelopeDto,
    description: 'LINK_NAME_TAKEN',
  })
  create(@Body() dto: LinkCreateDto): Link {
    const result = this.repository.create(dto);

    if (result.ok) {
      return withDerivedStatus(result.link, null, new Date());
    }

    // Exhaustive on purpose: `noImplicitReturns` makes a reason this switch
    // doesn't cover a compile error, not a silent mislabel.
    switch (result.reason) {
      case 'name-taken':
        throw new LinkNameTakenError(dto.name);
    }
  }

  @Patch(':id')
  @ZodResponse({ status: 200, type: LinkDto })
  @ApiResponse({
    status: 400,
    type: ApiErrorEnvelopeDto,
    description:
      'VALIDATION_FAILED — no `version`, or a field outside its documented range',
  })
  @ApiResponse({
    status: 404,
    type: ApiErrorEnvelopeDto,
    description: 'LINK_NOT_FOUND',
  })
  @ApiResponse({
    status: 409,
    type: ApiErrorEnvelopeDto,
    description:
      'LINK_NAME_TAKEN, or LINK_VERSION_CONFLICT carrying the current Link',
  })
  update(@Param('id') id: string, @Body() dto: LinkPatchDto): Link {
    const { version, ...patch } = dto;
    const result = this.repository.update(toLinkId(id), patch, version);

    if (result.ok) {
      return this.present(result.link);
    }

    // Exhaustive on purpose, and more load-bearing here than on `create`:
    // ADR-0008 says a fourth way for a write to miss must break every caller,
    // and `noImplicitReturns` is what makes that a compile error rather than
    // a silent mislabel.
    switch (result.reason) {
      case 'not-found':
        throw new LinkNotFoundError(id);
      case 'name-taken':
        throw new LinkNameTakenError(result.name);
      case 'version-conflict':
        // The whole current Link, derived exactly as a successful read would
        // present it, so the Console diffs like against like.
        throw new LinkVersionConflictError(this.present(result.current));
    }
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiResponse({ status: 204, description: 'Deleted — no body' })
  @ApiResponse({ status: 404, type: ApiErrorEnvelopeDto })
  remove(@Param('id') id: string): void {
    const linkId = toLinkId(id);
    const deleted = this.repository.delete(linkId);

    if (!deleted) {
      throw new LinkNotFoundError(id);
    }

    // Repository first, dropLink second — load-bearing per CONTEXT.md's
    // consistency boundary. A Tick racing this delete then either runs
    // before both (its Sample lands in a buffer that is dropped a moment
    // later) or after the repository delete (it finds no Link and writes
    // nothing). The reverse order has a real hole: drop the buffer, Tick
    // fires, and it is lazily recreated for a Link that no longer exists.
    this.telemetry.dropLink(linkId);
  }

  /** One stored record as the API presents it: status derived, read now. */
  private present(record: LinkRecord): Link {
    return withDerivedStatus(
      record,
      this.telemetry.latestSample(record.id),
      new Date(),
    );
  }

  /** A record as `findAll`'s status filter and sort need it — see `SortableLink`. */
  private toSortableEntry(record: LinkRecord, now: Date): SortableLink {
    const latestSample = this.telemetry.latestSample(record.id);

    return {
      link: withDerivedStatus(record, latestSample, now),
      throughputMbps: latestSample?.throughputMbps ?? 0,
    };
  }
}
