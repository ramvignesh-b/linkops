import { Controller, Get, Inject, Param } from '@nestjs/common';
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
import { LinkNotFoundError } from './errors/link-not-found.error';

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
}

/** Status is never stored — every Link leaving this controller has it derived fresh. */
function withStatus(
  record: LinkRecord,
  latestSample: TelemetrySample | null,
  now: Date,
): Link {
  return { ...record, status: deriveStatus(record, latestSample, now) };
}
