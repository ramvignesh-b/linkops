import { Module } from '@nestjs/common';
import {
  LINK_REPOSITORY,
  ServerLinksDataAccessModule,
  type LinkRepository,
} from '@linkops/server/links-data-access';
import { systemClock } from './clock';
import { Simulator } from './simulator';
import { SimulatorTelemetryPort } from './simulator-telemetry-port';
import { TelemetryBus } from './telemetry-bus';
import { TELEMETRY_BUS } from './telemetry-bus.token';
import { TELEMETRY_PORT } from './telemetry-port.token';
import {
  SAMPLE_BUFFER_CAPACITY,
  TelemetrySampleStore,
} from './telemetry-sample-store';
import { TELEMETRY_SAMPLE_STORE } from './telemetry-sample-store.token';

/**
 * Everything that produces or holds telemetry, provided once by the library
 * that owns it. A second `Simulator` would be a second fleet inside one
 * process, so these are the instances every consumer shares: the links API
 * reads through `TELEMETRY_PORT`, and the stream subscribes to
 * `TELEMETRY_BUS`.
 */
@Module({
  imports: [ServerLinksDataAccessModule],
  providers: [
    {
      provide: TELEMETRY_SAMPLE_STORE,
      useFactory: () => new TelemetrySampleStore(SAMPLE_BUFFER_CAPACITY),
    },
    { provide: TELEMETRY_BUS, useFactory: () => new TelemetryBus() },
    // Registered so Nest instantiates and lifecycle-manages it, even though
    // nothing injects it by name — see Simulator.onModuleInit /
    // beforeApplicationShutdown and apps/api's app.enableShutdownHooks().
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
  ],
  // Simulator is exported alongside the tokens because ticket 06's health
  // instrument reads its Tick count from a feature module, and a provider
  // Nest merely lifecycle-manages is not resolvable from outside this one.
  exports: [TELEMETRY_PORT, TELEMETRY_BUS, TELEMETRY_SAMPLE_STORE, Simulator],
})
export class ServerTelemetryModule {}
