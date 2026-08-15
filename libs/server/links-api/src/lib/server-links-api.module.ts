import { Module } from '@nestjs/common';
import {
  LINK_REPOSITORY,
  createSeededLinkRepository,
} from '@linkops/server/links-data-access';
import {
  NoSampleTelemetryPort,
  TELEMETRY_PORT,
} from '@linkops/server/telemetry';
import { LinksController } from './links.controller';

@Module({
  controllers: [LinksController],
  providers: [
    { provide: LINK_REPOSITORY, useFactory: createSeededLinkRepository },
    { provide: TELEMETRY_PORT, useClass: NoSampleTelemetryPort },
  ],
  exports: [],
})
export class ServerLinksApiModule {}
