import { Module } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ZodValidationPipe } from 'nestjs-zod';
import {
  LINK_REPOSITORY,
  createSeededLinkRepository,
} from '@linkops/server/links-data-access';
import {
  NoSampleTelemetryPort,
  TELEMETRY_PORT,
} from '@linkops/server/telemetry';
import { LinksController } from './links.controller';
import { LinkDomainErrorFilter } from './link-domain-error.filter';

@Module({
  controllers: [LinksController],
  providers: [
    { provide: LINK_REPOSITORY, useFactory: createSeededLinkRepository },
    { provide: TELEMETRY_PORT, useClass: NoSampleTelemetryPort },
    { provide: APP_FILTER, useClass: LinkDomainErrorFilter },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
  ],
  exports: [],
})
export class ServerLinksApiModule {}
