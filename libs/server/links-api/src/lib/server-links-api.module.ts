import { Module } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ZodValidationPipe } from 'nestjs-zod';
import {
  LINK_REPOSITORY,
  createSeededLinkRepository,
  type LinkRepository,
} from '@linkops/server/links-data-access';
import {
  SAMPLE_BUFFER_CAPACITY,
  Simulator,
  SimulatorTelemetryPort,
  systemClock,
  TELEMETRY_BUS,
  TELEMETRY_PORT,
  TELEMETRY_SAMPLE_STORE,
  TelemetryBus,
  TelemetrySampleStore,
} from '@linkops/server/telemetry';
import { FleetController } from './fleet.controller';
import { LinksController } from './links.controller';
import { LinkDomainErrorFilter } from './link-domain-error.filter';

@Module({
  controllers: [LinksController, FleetController],
  providers: [
    { provide: LINK_REPOSITORY, useFactory: createSeededLinkRepository },
    {
      provide: TELEMETRY_SAMPLE_STORE,
      useFactory: () => new TelemetrySampleStore(SAMPLE_BUFFER_CAPACITY),
    },
    { provide: TELEMETRY_BUS, useFactory: () => new TelemetryBus() },
    // Registered so Nest instantiates and lifecycle-manages it, even though
    // nothing injects it by name — see Simulator.onModuleInit /
    // onApplicationShutdown and apps/api's app.enableShutdownHooks().
    {
      provide: Simulator,
      useFactory: (
        repository: LinkRepository,
        store: TelemetrySampleStore,
        bus: TelemetryBus,
      ) => new Simulator(repository, store, bus, systemClock, Math.random),
      inject: [LINK_REPOSITORY, TELEMETRY_SAMPLE_STORE, TELEMETRY_BUS],
    },
    {
      provide: TELEMETRY_PORT,
      useFactory: (repository: LinkRepository, store: TelemetrySampleStore) =>
        new SimulatorTelemetryPort(repository, store, systemClock),
      inject: [LINK_REPOSITORY, TELEMETRY_SAMPLE_STORE],
    },
    { provide: APP_FILTER, useClass: LinkDomainErrorFilter },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
  ],
  exports: [],
})
export class ServerLinksApiModule {}
