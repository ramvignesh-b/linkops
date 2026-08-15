import { Controller, Get, Inject } from '@nestjs/common';
import { deriveStatus, type Link } from '@linkops/shared/domain';
import {
  LINK_REPOSITORY,
  type LinkRepository,
} from '@linkops/server/links-data-access';
import { TELEMETRY_PORT, type TelemetryPort } from '@linkops/server/telemetry';

@Controller('links')
export class LinksController {
  constructor(
    @Inject(LINK_REPOSITORY) private readonly repository: LinkRepository,
    @Inject(TELEMETRY_PORT) private readonly telemetry: TelemetryPort,
  ) {}

  @Get()
  findAll(): Link[] {
    const now = new Date();

    return this.repository.findAll().map((record) => ({
      ...record,
      status: deriveStatus(record, this.telemetry.latestSample(record.id), now),
    }));
  }
}
