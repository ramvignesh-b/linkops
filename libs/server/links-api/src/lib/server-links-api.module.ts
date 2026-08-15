import { Module } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ZodValidationPipe } from 'nestjs-zod';
import {
  LINK_REPOSITORY,
  createSeededLinkRepository,
  type LinkRepository,
} from '@linkops/server/links-data-access';
import {
  NoSampleTelemetryPort,
  TELEMETRY_PORT,
} from '@linkops/server/telemetry';
import { FleetController } from './fleet.controller';
import { LinksController } from './links.controller';
import { LinkDomainErrorFilter } from './link-domain-error.filter';

@Module({
  controllers: [LinksController, FleetController],
  providers: [
    { provide: LINK_REPOSITORY, useFactory: createSeededLinkRepository },
    {
      provide: TELEMETRY_PORT,
      useFactory: (repository: LinkRepository) =>
        new NoSampleTelemetryPort(repository),
      inject: [LINK_REPOSITORY],
    },
    { provide: APP_FILTER, useClass: LinkDomainErrorFilter },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
  ],
  exports: [],
})
export class ServerLinksApiModule {}
