import { z } from 'zod';
import { fleetSummarySchema } from './fleet-summary';
import { linkSchema } from './link';
import { telemetrySampleSchema } from './telemetry-sample';

/**
 * The Tick a stream event belongs to, and the `id:` it travels under. `0`
 * is the Fleet before the Simulator's first Tick — a real state a
 * connection can open in, not a missing value.
 */
export const tickNumberSchema = z.number().int().nonnegative();

/**
 * One Tick's readings for the whole Fleet in one event — every Link's
 * Sample as an array element, never one event per Link. `samples` is empty
 * on a Tick that found no Links, which is a Tick that happened rather than
 * a Tick that was skipped.
 */
export const linkTelemetryEventSchema = z.object({
  tick: tickNumberSchema,
  ts: z.iso.datetime(),
  samples: z.array(telemetrySampleSchema),
});

export type LinkTelemetryEvent = z.infer<typeof linkTelemetryEventSchema>;

/**
 * The Fleet Snapshot every connection opens with: the Roster with Status
 * derived, the latest Sample per Link, and the Fleet Summary, all captured
 * at one instant. It is what a reconnecting Client resynchronises from —
 * the current state, never a Replay of what it missed (ADR-0005).
 */
export const fleetSnapshotSchema = z.object({
  tick: tickNumberSchema,
  ts: z.iso.datetime(),
  links: z.array(linkSchema),
  samples: z.array(telemetrySampleSchema),
  summary: fleetSummarySchema,
});

export type FleetSnapshot = z.infer<typeof fleetSnapshotSchema>;

/**
 * The event catalogue as one closed union: an event name and the payload
 * that name carries. The Console validates received frames against this,
 * and on the server it is what stops an event being published under a name
 * whose payload it does not match — adding an event without extending the
 * catalogue does not compile.
 */
export const streamEventSchema = z.discriminatedUnion('event', [
  z.object({
    event: z.literal('fleet.snapshot'),
    data: fleetSnapshotSchema,
  }),
  z.object({
    event: z.literal('link.telemetry'),
    data: linkTelemetryEventSchema,
  }),
  z.object({ event: z.literal('fleet.summary'), data: fleetSummarySchema }),
]);

export type StreamEvent = z.infer<typeof streamEventSchema>;

/** The event names the catalogue currently carries, for a client to switch on. */
export type StreamEventName = StreamEvent['event'];
