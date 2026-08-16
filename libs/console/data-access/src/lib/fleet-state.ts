import type {
  FleetSummary,
  Link,
  LinkId,
  StreamEvent,
  TelemetrySample,
} from '@linkops/shared/domain';

/**
 * Everything the Fleet screens read, held as one value so that a Tick applies
 * as a single write. Three signals updated one after another would be three
 * chances for the Summary header and the rows beneath it to be read a Tick apart.
 */
export interface FleetState {
  /** The Roster, each Link carrying the Status the Server derived for it. */
  readonly links: readonly Link[];
  /** The latest Sample per Link — bounded by the size of the Fleet. */
  readonly latestSample: ReadonlyMap<LinkId, TelemetrySample>;
  /** The Server's Summary, verbatim. `null` until the first one arrives. */
  readonly summary: FleetSummary | null;
}

/** A cold Console: no Roster, no readings, and no Summary — none of them zero. */
export const emptyFleetState: FleetState = {
  links: [],
  latestSample: new Map(),
  summary: null,
};

/**
 * One stream event folded into the state. Pure, exhaustive on the event name,
 * and the whole of what the Console does with a frame — nothing here derives a
 * Status or aggregates a Summary, because both are the Server's to produce.
 */
export function applyStreamEvent(
  state: FleetState,
  event: StreamEvent,
): FleetState {
  switch (event.event) {
    case 'fleet.snapshot':
      // Wholesale, never merged: the Snapshot is what a recovering Console
      // resynchronises from, so anything it does not mention is gone.
      return {
        links: event.data.links,
        latestSample: samplesById(event.data.samples),
        summary: event.data.summary,
      };

    case 'link.created':
    case 'link.updated':
      // One case for both, and idempotent: a `link.created` for a Link
      // already on screen replaces it rather than doubling the row.
      return { ...state, links: upsert(state.links, event.data) };

    case 'link.deleted':
      return dropLink(state, event.data.linkId);

    case 'link.telemetry':
      return { ...state, latestSample: withSamples(state, event.data.samples) };

    case 'link.status':
      return {
        ...state,
        links: state.links.map((link) =>
          link.id === event.data.linkId
            ? { ...link, status: event.data.status }
            : link,
        ),
      };

    case 'fleet.summary':
      return { ...state, summary: event.data };
  }
}

function samplesById(
  samples: readonly TelemetrySample[],
): ReadonlyMap<LinkId, TelemetrySample> {
  return new Map(samples.map((sample) => [sample.linkId, sample]));
}

function withSamples(
  state: FleetState,
  samples: readonly TelemetrySample[],
): ReadonlyMap<LinkId, TelemetrySample> {
  const merged = new Map(state.latestSample);

  for (const sample of samples) {
    merged.set(sample.linkId, sample);
  }

  return merged;
}

function upsert(links: readonly Link[], link: Link): readonly Link[] {
  return links.some((existing) => existing.id === link.id)
    ? links.map((existing) => (existing.id === link.id ? link : existing))
    : [...links, link];
}

/**
 * The Link and its reading together — the same pairing `DELETE /api/links/:id`
 * enforces on the Server, for the same reason: a Sample outliving its Link is
 * a leak, and it is also the one row an operator could still act on.
 *
 * Idempotent, so the `link.deleted` frame that follows a local delete up to a
 * Tick later changes nothing.
 */
function dropLink(state: FleetState, linkId: LinkId): FleetState {
  const latestSample = new Map(state.latestSample);
  latestSample.delete(linkId);

  return {
    ...state,
    links: state.links.filter((link) => link.id !== linkId),
    latestSample,
  };
}
