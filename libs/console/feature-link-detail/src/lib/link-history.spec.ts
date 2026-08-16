import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import {
  EVENT_SOURCE,
  FleetStore,
  type EventSourceLike,
} from '@linkops/console/data-access';
import {
  toLinkId,
  type Link,
  type StreamEventName,
  type TelemetrySample,
} from '@linkops/shared/domain';
import { HISTORY_CAP, LinkHistory } from './link-history';

const LINK_A = toLinkId('lnk_alpha');
const LINK_B = toLinkId('lnk_bravo');

const EMPTY_SUMMARY = {
  total: 0,
  up: 0,
  degraded: 0,
  down: 0,
  totalThroughputMbps: 0,
  worstLinkId: null,
};

function sample(
  linkId: Link['id'],
  ts: string,
  throughputMbps: number,
): TelemetrySample {
  return {
    linkId,
    ts,
    rssiDbm: -55,
    snrDb: 24,
    throughputMbps,
  };
}

class FakeEventSource implements EventSourceLike {
  private readonly listeners = new Map<
    string,
    ((event: MessageEvent<string>) => void)[]
  >();
  closed = false;
  readyState = 1;

  addEventListener(
    type: string,
    listener: (event: MessageEvent<string>) => void,
  ): void {
    const existing = this.listeners.get(type) ?? [];
    this.listeners.set(type, [...existing, listener]);
  }

  close(): void {
    this.closed = true;
  }

  emit(event: StreamEventName, data: unknown, tick = 0): void {
    const message = new MessageEvent<string>(event, {
      data: JSON.stringify(data),
      lastEventId: String(tick),
    });
    for (const listener of this.listeners.get(event) ?? []) {
      listener(message);
    }
  }
}

describe('LinkHistory', () => {
  let history: LinkHistory;
  let http: HttpTestingController;
  let stream: FakeEventSource;

  /** The window request, with the duration the Console asks for explicitly. */
  const expectWindow = (id: string) => {
    const request = http.expectOne(
      (candidate) => candidate.url === `/api/links/${id}/telemetry`,
    );
    expect(request.request.params.get('window')).toBe('5m');

    return request;
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: EVENT_SOURCE,
          useValue: (_url: string) => {
            stream = new FakeEventSource();
            return stream;
          },
        },
        FleetStore,
        LinkHistory,
      ],
    });

    history = TestBed.inject(LinkHistory);
    http = TestBed.inject(HttpTestingController);
    // Ignore first paint REST calls from FleetStore constructor
    http.expectOne('/api/links').flush([]);
    http.expectOne('/api/fleet/summary').flush(EMPTY_SUMMARY);
  });

  afterEach(() => {
    http.verify();
  });

  it('fetches history window on load and sorts samples by timestamp', () => {
    history.load(LINK_A);

    const req = expectWindow('lnk_alpha');
    expect(req.request.method).toBe('GET');

    const s1 = sample(LINK_A, '2026-08-16T10:00:02.000Z', 20);
    const s2 = sample(LINK_A, '2026-08-16T10:00:01.000Z', 10);
    req.flush([s1, s2]);

    expect(history.samples()).toEqual([s2, s1]);
  });

  it('deduplicates samples on timestamp when live sample overlaps REST window', () => {
    history.load(LINK_A);

    const s1 = sample(LINK_A, '2026-08-16T10:00:01.000Z', 10);
    const s2 = sample(LINK_A, '2026-08-16T10:00:02.000Z', 20);
    expectWindow('lnk_alpha').flush([s1, s2]);

    // Push live sample with same ts as s2 via tick (telemetry + summary)
    const s2Duplicate = sample(LINK_A, '2026-08-16T10:00:02.000Z', 25);
    stream.emit(
      'link.telemetry',
      { tick: 1, ts: '2026-08-16T10:00:02.000Z', samples: [s2Duplicate] },
      1,
    );
    stream.emit(
      'fleet.summary',
      {
        total: 1,
        up: 1,
        degraded: 0,
        down: 0,
        totalThroughputMbps: 25,
        worstLinkId: null,
      },
      1,
    );
    TestBed.flushEffects();

    expect(history.samples().length).toBe(2);
    expect(history.samples()[1].throughputMbps).toBe(25);
  });

  it('appends live samples for the watched link and ignores other links', () => {
    history.load(LINK_A);
    expectWindow('lnk_alpha').flush([]);

    const sA = sample(LINK_A, '2026-08-16T10:00:01.000Z', 50);
    const sB = sample(LINK_B, '2026-08-16T10:00:01.000Z', 99);

    stream.emit(
      'link.telemetry',
      { tick: 1, ts: '2026-08-16T10:00:01.000Z', samples: [sA, sB] },
      1,
    );
    stream.emit(
      'fleet.summary',
      {
        total: 2,
        up: 2,
        degraded: 0,
        down: 0,
        totalThroughputMbps: 149,
        worstLinkId: null,
      },
      1,
    );
    TestBed.flushEffects();

    expect(history.samples()).toEqual([sA]);
  });

  it('caps the buffer at the Server`s own per-Link bound, dropping the oldest', () => {
    history.load(LINK_A);

    const overflow = 50;
    const initialSamples: TelemetrySample[] = [];
    for (let i = 0; i < HISTORY_CAP + overflow; i++) {
      const date = new Date(Date.UTC(2026, 7, 16, 10, 0, i));
      initialSamples.push(sample(LINK_A, date.toISOString(), i));
    }
    expectWindow('lnk_alpha').flush(initialSamples);

    const retained = history.samples();
    expect(retained.length).toBe(HISTORY_CAP);
    // The oldest `overflow` Samples are the ones that went.
    expect(retained[0].throughputMbps).toBe(overflow);
    expect(retained[HISTORY_CAP - 1].throughputMbps).toBe(
      HISTORY_CAP + overflow - 1,
    );
  });

  it('reports the window fetch failing rather than showing an empty chart', () => {
    history.load(LINK_A);
    expect(history.historyUnavailable()).toBe(false);

    expectWindow('lnk_alpha').flush(null, {
      status: 503,
      statusText: 'Service Unavailable',
    });

    // No history, but the reason is *we could not ask*, which is a different
    // fact from this Link having reported nothing.
    expect(history.samples()).toEqual([]);
    expect(history.historyUnavailable()).toBe(true);
  });

  it('charts a Sample the store already held when the route opened', () => {
    // The Sample arrives before anything watches this Link.
    const held = sample(LINK_A, '2026-08-16T10:00:01.000Z', 50);
    stream.emit('link.telemetry', { tick: 1, ts: held.ts, samples: [held] }, 1);
    stream.emit('fleet.summary', { ...EMPTY_SUMMARY, total: 1, up: 1 }, 1);
    TestBed.flushEffects();

    history.load(LINK_A);
    expectWindow('lnk_alpha').flush([]);
    TestBed.flushEffects();

    expect(history.samples()).toEqual([held]);
  });
});
