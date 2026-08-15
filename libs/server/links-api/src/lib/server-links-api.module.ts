import { Module } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ZodValidationPipe } from 'nestjs-zod';
import { ServerLinksDataAccessModule } from '@linkops/server/links-data-access';
import { ServerTelemetryModule } from '@linkops/server/telemetry';
import { FleetController } from './fleet.controller';
import { LinksController } from './links.controller';
import { LinkDomainErrorFilter } from './link-domain-error.filter';

/**
 * The HTTP surface for Links and the Fleet. It owns its controllers and the
 * two application-scoped providers that shape every response — the error
 * envelope filter and the validation pipe — and nothing else: the Roster and
 * the telemetry providers belong to the libraries that own them, so a second
 * feature can share the same instances rather than constructing its own.
 */
@Module({
  imports: [ServerLinksDataAccessModule, ServerTelemetryModule],
  controllers: [LinksController, FleetController],
  providers: [
    { provide: APP_FILTER, useClass: LinkDomainErrorFilter },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
  ],
  exports: [],
})
export class ServerLinksApiModule {}
