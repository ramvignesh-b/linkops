import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  deriveStatus,
  toLinkId,
  type Link,
  type TelemetrySample,
} from '@linkops/shared/domain';
import {
  LINK_REPOSITORY,
  type LinkRecord,
  type LinkRepository,
} from '@linkops/server/links-data-access';
import { TELEMETRY_PORT, type TelemetryPort } from '@linkops/server/telemetry';
import { LinkCreateDto } from './dto/link-create.dto';
import { LinkPatchDto } from './dto/link-patch.dto';
import { LinkNameTakenError } from './errors/link-name-taken.error';
import { LinkNotFoundError } from './errors/link-not-found.error';
import { LinkVersionConflictError } from './errors/link-version-conflict.error';

@Controller('links')
export class LinksController {
  constructor(
    @Inject(LINK_REPOSITORY) private readonly repository: LinkRepository,
    @Inject(TELEMETRY_PORT) private readonly telemetry: TelemetryPort,
  ) {}

  @Get()
  findAll(): Link[] {
    const now = new Date();

    return this.repository
      .findAll()
      .map((record) =>
        withStatus(record, this.telemetry.latestSample(record.id), now),
      );
  }

  @Get(':id')
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

    return { link: withStatus(record, latestSample, new Date()), latestSample };
  }

  @Post()
  @HttpCode(201)
  create(@Body() dto: LinkCreateDto): Link {
    const result = this.repository.create(dto);

    if (result.ok) {
      return withStatus(result.link, null, new Date());
    }

    // Exhaustive on purpose: `noImplicitReturns` makes a reason this switch
    // doesn't cover a compile error, not a silent mislabel.
    switch (result.reason) {
      case 'name-taken':
        throw new LinkNameTakenError(dto.name);
    }
  }

  @Patch(':id')
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

  /** One stored record as the API presents it: status derived, read now. */
  private present(record: LinkRecord): Link {
    return withStatus(
      record,
      this.telemetry.latestSample(record.id),
      new Date(),
    );
  }
}

/** Status is never stored — every Link leaving this controller has it derived fresh. */
function withStatus(
  record: LinkRecord,
  latestSample: TelemetrySample | null,
  now: Date,
): Link {
  return { ...record, status: deriveStatus(record, latestSample, now) };
}
