import { Module } from '@nestjs/common';
import { ServerLinksDataAccessModule } from '@linkops/server/links-data-access';
import { ServerTelemetryModule } from '@linkops/server/telemetry';
import { FleetEventStream } from './fleet-event-stream';
import { SseSubscriberCounter } from './sse-subscriber-counter';
import { StreamController } from './stream.controller';

/**
 * The streaming surface. It shares the Roster and the telemetry providers
 * with the links API rather than constructing its own — a second Simulator
 * would be a second Fleet inside one process.
 *
 * The subscriber counter is exported because the health instrument publishes
 * it as `sseSubscribers`.
 */
@Module({
  imports: [ServerLinksDataAccessModule, ServerTelemetryModule],
  controllers: [StreamController],
  providers: [FleetEventStream, SseSubscriberCounter],
  exports: [SseSubscriberCounter],
})
export class ServerStreamApiModule {}
