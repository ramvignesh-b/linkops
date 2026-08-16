import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import {
  EVENT_SOURCE,
  STREAM_REOPEN_DELAY_MS,
  type EventSourceLike,
} from '@linkops/console/data-access';
import {
  toLinkId,
  type FleetSummary,
  type Link,
  type StreamEventName,
  type TelemetrySample,
} from '@linkops/shared/domain';
import { App } from './app';
import { appConfig } from './app.config';

/**
 * The stream, faked at the one place the Console touches the browser's
 * network primitives. It exists because **jsdom has no `EventSource`** —
 * without the `EVENT_SOURCE` token these tests could not run at all — and it
 * emits synchronously, which is why no test here waits on the clock.
 */
class FakeEventSource implements EventSourceLike {
  private readonly listeners = new Map<
    string,
    ((event: MessageEvent<string>) => void)[]
  >();

  closed = false;

  /** OPEN, until a test says the browser is retrying (0) or has given up (2). */
  readyState = 1;

  constructor(readonly url: string) {}

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

  /** One frame as the Server writes it: a named event, JSON data, the Tick as `id:`. */
  emit(event: StreamEventName, data: unknown, tick: number): void {
    this.emitRaw(event, JSON.stringify(data), tick);
  }

  emitRaw(event: string, data: string, tick = 0): void {
    const message = new MessageEvent<string>(event, {
      data,
      lastEventId: String(tick),
    });

    for (const listener of this.listeners.get(event) ?? []) {
      listener(message);
    }
  }

  /** What the browser dispatches when the connection goes. */
  fail(): void {
    this.emitRaw('error', '');
  }
}

const AT = {
  load: '2026-08-16T10:00:00.000Z',
  tick41: '2026-08-16T10:00:41.000Z',
  tick42: '2026-08-16T10:00:42.000Z',
  tick43: '2026-08-16T10:00:43.000Z',
  tick60: '2026-08-16T10:01:00.000Z',
  tick61: '2026-08-16T10:01:01.000Z',
  tick70: '2026-08-16T10:01:10.000Z',
} as const;

/**
 * Yields to the macrotask queue, which is where the reopen was scheduled. Not a
 * sleep: with the delay at zero the reopen is already queued ahead of this, so
 * FIFO ordering — not elapsed time — is what makes it deterministic.
 */
const nextMacrotask = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

const ALPHA = toLinkId('lnk_alpha');
const BRAVO = toLinkId('lnk_bravo');
const CHARLIE = toLinkId('lnk_charlie');

function link(overrides: Partial<Link> & Pick<Link, 'id' | 'name'>): Link {
  return {
    siteA: 'Ridge North',
    siteB: 'Ridge South',
    band: '5GHz',
    mode: 'PtP',
    capacityMbps: 100,
    txPowerDbm: 20,
    channelWidthMhz: 40,
    status: { status: 'up' },
    version: 1,
    createdAt: AT.load,
    updatedAt: AT.load,
    ...overrides,
  };
}

function sample(
  linkId: Link['id'],
  ts: string,
  throughputMbps: number,
  snrDb = 24,
): TelemetrySample {
  return { linkId, ts, rssiDbm: -55, snrDb, throughputMbps };
}

const alpha = link({ id: ALPHA, name: 'Alpha Ridge' });
const bravo = link({
  id: BRAVO,
  name: 'Bravo Pass',
  siteA: 'Pass East',
  siteB: 'Pass West',
  band: '11GHz',
  capacityMbps: 400,
  status: { status: 'degraded' },
});
const charlie = link({
  id: CHARLIE,
  name: 'Charlie Col',
  siteA: 'Col Upper',
  siteB: 'Col Lower',
  band: '24GHz',
  capacityMbps: 200,
  status: { status: 'up' },
});

function summary(overrides: Partial<FleetSummary> = {}): FleetSummary {
  return {
    total: 2,
    up: 1,
    degraded: 1,
    down: 0,
    totalThroughputMbps: 0,
    worstLinkId: null,
    ...overrides,
  };
}

/**
 * The routed Console, booted from the application's own provider list with
 * only the two browser network primitives replaced. Everything between the
 * wire and the DOM — schema validation, the store and its Tick coalescer,
 * the router, `console/ui` — is the code that ships.
 */
async function bootConsole(): Promise<{
  fixture: ComponentFixture<App>;
  http: HttpTestingController;
  stream: () => FakeEventSource;
}> {
  const sources: FakeEventSource[] = [];

  TestBed.configureTestingModule({
    providers: [
      ...appConfig.providers,
      provideHttpClientTesting(),
      // The reopen cadence is the Server's 3 seconds in the application; here
      // it is the next macrotask, so the test waits on ordering rather than on
      // the clock.
      { provide: STREAM_REOPEN_DELAY_MS, useValue: 0 },
      {
        provide: EVENT_SOURCE,
        useValue: (url: string): EventSourceLike => {
          const source = new FakeEventSource(url);
          sources.push(source);

          return source;
        },
      },
    ],
  });

  const fixture = TestBed.createComponent(App);
  await TestBed.inject(Router).navigate(['/links']);
  await fixture.whenStable();

  return {
    fixture,
    http: TestBed.inject(HttpTestingController),
    stream: () => {
      const source = sources[sources.length - 1];
      if (source === undefined) throw new Error('the stream was never opened');

      return source;
    },
  };
}

/** First paint: the Roster and the Fleet Summary, together and unfiltered. */
function answerFirstPaint(
  http: HttpTestingController,
  links: Link[],
  fleetSummary: FleetSummary,
): void {
  const roster = http.expectOne((request) => request.url === '/api/links');
  // No query parameters: the Console loads the whole Roster and filters it
  // itself, so a Link entering a filtered view mid-Tick needs no refetch.
  expect(roster.request.urlWithParams).toBe('/api/links');
  roster.flush(links);
  http.expectOne('/api/fleet/summary').flush(fleetSummary);
}

const screen = (fixture: ComponentFixture<App>) => {
  const root = fixture.nativeElement as HTMLElement;

  const row = (id: Link['id']): HTMLElement => {
    const found = root.querySelector<HTMLElement>(`tr[data-link-id="${id}"]`);
    if (found === null) throw new Error(`no row for ${id}`);

    return found;
  };

  const text = (element: Element | null): string =>
    (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

  return {
    rowNames: () =>
      [...root.querySelectorAll('tbody .cell-name')].map((cell) => text(cell)),
    rowIds: () =>
      [...root.querySelectorAll<HTMLElement>('tbody tr')].map(
        (tr) => tr.dataset['linkId'],
      ),
    status: (id: Link['id']) => text(row(id).querySelector('lib-status-pill')),
    throughput: (id: Link['id']) =>
      text(row(id).querySelector('lib-throughput-bar')),
    cell: (id: Link['id'], name: string) =>
      text(row(id).querySelector(`.cell-${name}`)),
    kpi: (label: string) => {
      const tile = [...root.querySelectorAll('lib-kpi-tile')].find(
        (candidate) => text(candidate.querySelector('.kpi-label')) === label,
      );

      return text(tile?.querySelector('.kpi-value') ?? null);
    },
    worstLinkHref: () =>
      root.querySelector('.worst-link a')?.getAttribute('href') ?? null,
    banner: () => root.querySelector<HTMLElement>('lib-connection-banner p'),
    heading: () => text(root.querySelector('.kpi h2')),
  };
};

/**
 * Ends a test the way closing the Console ends the application: nothing left
 * unanswered, then the environment torn down. Tearing it down is what fires the
 * store's `DestroyRef` — a root-provided store outlives every component, so
 * destroying a fixture is not what releases its stream.
 */
function finish(): void {
  // Nothing polls: every Tick after first paint arrives over the stream, so an
  // unexpected request here is a regression rather than an oversight.
  TestBed.inject(HttpTestingController).verify();
  TestBed.resetTestingModule();
}

describe('the live Fleet list', () => {
  it('paints over REST, then lets the stream take over one Tick at a time', async () => {
    const { fixture, http, stream } = await bootConsole();

    answerFirstPaint(
      http,
      [alpha, bravo],
      summary({ up: 1, degraded: 1, totalThroughputMbps: 61 }),
    );
    await fixture.whenStable();

    // The Fleet is on screen before a single frame has arrived.
    const view = screen(fixture);
    expect(view.rowNames()).toEqual(['Alpha Ridge', 'Bravo Pass']);
    expect(view.cell(ALPHA, 'sites')).toBe('Ridge North → Ridge South');
    expect(view.cell(BRAVO, 'band')).toBe('11GHz');
    expect(view.status(ALPHA)).toBe('up');
    expect(view.status(BRAVO)).toBe('degraded');
    // REST carries no Sample, so Throughput is unknown rather than zero —
    // zero is a reading, and nobody has taken one yet.
    expect(view.throughput(ALPHA)).toBe('— / 100 Mbps');
    expect(view.heading()).toBe('Fleet-wide');
    expect(view.kpi('Total throughput')).toBe('61 Mbps');

    // The stream takes over: the Snapshot replaces that state wholesale.
    expect(stream().url).toBe('/api/stream');
    stream().emit(
      'fleet.snapshot',
      {
        tick: 41,
        ts: AT.tick41,
        links: [
          alpha,
          { ...bravo, status: { status: 'down', reason: 'metrics' } },
        ],
        samples: [sample(ALPHA, AT.tick41, 42), sample(BRAVO, AT.tick41, 3, 6)],
        summary: summary({
          up: 1,
          degraded: 0,
          down: 1,
          totalThroughputMbps: 45,
          worstLinkId: BRAVO,
        }),
      },
      41,
    );
    await fixture.whenStable();

    expect(view.throughput(ALPHA)).toBe('42 / 100 Mbps');
    expect(view.throughput(BRAVO)).toBe('3 / 400 Mbps');
    // The `down` reason is a label, not a fourth colour, and it answers *why*.
    expect(view.status(BRAVO)).toBe('down · poor signal');
    expect(view.kpi('Links')).toBe('2');
    expect(view.kpi('Up')).toBe('1');
    expect(view.kpi('Degraded')).toBe('0');
    expect(view.kpi('Down')).toBe('1');
    expect(view.kpi('Total throughput')).toBe('45 Mbps');
    expect(view.worstLinkHref()).toBe('/links/lnk_bravo');

    // A Tick whose `fleet.summary` has not landed yet changes nothing on
    // screen: the Console applies a whole Tick or none of it.
    stream().emit(
      'link.telemetry',
      { tick: 42, ts: AT.tick42, samples: [sample(ALPHA, AT.tick42, 80)] },
      42,
    );
    await fixture.whenStable();
    expect(view.throughput(ALPHA)).toBe('42 / 100 Mbps');

    // A frame that fails validation is dropped and logged, never rendered.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    stream().emitRaw(
      'link.telemetry',
      '{"tick":43,"samples":"not-an-array"}',
      43,
    );
    await fixture.whenStable();
    expect(warn).toHaveBeenCalled();
    expect(view.throughput(ALPHA)).toBe('42 / 100 Mbps');
    warn.mockRestore();

    // Tick 43 completes, and carries Tick 42's readings with it rather than
    // stalling on the Tick that lost its terminator.
    stream().emit('link.created', charlie, 43);
    stream().emit(
      'link.telemetry',
      {
        tick: 43,
        ts: AT.tick43,
        samples: [
          sample(ALPHA, AT.tick43, 75),
          sample(BRAVO, AT.tick43, 120, 12),
          sample(CHARLIE, AT.tick43, 30),
        ],
      },
      43,
    );
    stream().emit(
      'link.status',
      {
        linkId: BRAVO,
        status: { status: 'degraded' },
        previous: { status: 'down', reason: 'metrics' },
      },
      43,
    );
    stream().emit(
      'fleet.summary',
      summary({
        total: 3,
        up: 2,
        degraded: 1,
        totalThroughputMbps: 225,
        worstLinkId: BRAVO,
      }),
      43,
    );
    await fixture.whenStable();

    // A Link another operator created is on screen without a reload.
    expect(view.rowNames()).toEqual([
      'Alpha Ridge',
      'Bravo Pass',
      'Charlie Col',
    ]);
    expect(view.throughput(ALPHA)).toBe('75 / 100 Mbps');
    expect(view.throughput(CHARLIE)).toBe('30 / 200 Mbps');
    // Rendered as the Server derived it — the Console never derives Status.
    expect(view.status(BRAVO)).toBe('degraded');
    expect(view.kpi('Links')).toBe('3');
    expect(view.kpi('Up')).toBe('2');
    expect(view.kpi('Total throughput')).toBe('225 Mbps');

    // Nothing invents a connection problem while frames are arriving.
    expect(view.banner()).toBeNull();

    finish();
  });

  it('freezes the Fleet when the stream drops, and resynchronises wholesale', async () => {
    const { fixture, http, stream } = await bootConsole();

    answerFirstPaint(
      http,
      [alpha, bravo],
      summary({ up: 1, degraded: 1, totalThroughputMbps: 61 }),
    );
    stream().emit(
      'fleet.snapshot',
      {
        tick: 41,
        ts: AT.tick41,
        links: [alpha, bravo],
        samples: [
          sample(ALPHA, AT.tick41, 42),
          sample(BRAVO, AT.tick41, 210, 14),
        ],
        summary: summary({
          up: 1,
          degraded: 1,
          totalThroughputMbps: 252,
          worstLinkId: BRAVO,
        }),
      },
      41,
    );
    await fixture.whenStable();

    const view = screen(fixture);
    expect(view.banner()).toBeNull();

    // A Tick that had begun when the connection went — its terminator never
    // arrived, so it is still buffered.
    stream().emit('link.deleted', { linkId: BRAVO }, 42);
    await fixture.whenStable();
    expect(view.rowIds()).toEqual(['lnk_alpha', 'lnk_bravo']);

    // The connection goes and the browser is retrying it: `readyState` is
    // CONNECTING, so this stream is still the one that will resynchronise.
    stream().readyState = 0;
    stream().fail();
    await fixture.whenStable();

    // Every row freezes at its last known reading. Nothing is blanked, and
    // nothing is recomputed.
    expect(view.throughput(ALPHA)).toBe('42 / 100 Mbps');
    expect(view.throughput(BRAVO)).toBe('210 / 400 Mbps');

    // No Link flips to `down` on the Console's own authority: *the Fleet died*
    // and *my connection died* have to stay two different screens.
    expect(view.status(ALPHA)).toBe('up');
    expect(view.status(BRAVO)).toBe('degraded');
    expect(view.kpi('Down')).toBe('0');
    // The header freezes with the rows, so the two still agree.
    expect(view.kpi('Total throughput')).toBe('252 Mbps');

    // The banner names the time of the last good frame — the Server's own
    // timestamp, exact on the element and local time in the words.
    const banner = view.banner();
    expect(banner?.textContent).toContain('Connection lost');
    expect(banner?.querySelector('time')?.getAttribute('datetime')).toBe(
      AT.tick41,
    );

    // The connection returns on the same stream, because the browser was
    // retrying it. The Snapshot replaces the frozen state wholesale: Alpha Ridge
    // was deleted during the gap and is simply absent, rather than lingering as
    // a stale row.
    stream().emit(
      'fleet.snapshot',
      {
        tick: 60,
        ts: AT.tick60,
        links: [{ ...bravo, status: { status: 'up' } }, charlie],
        samples: [
          sample(BRAVO, AT.tick60, 300, 22),
          sample(CHARLIE, AT.tick60, 15),
        ],
        summary: summary({
          total: 2,
          up: 2,
          degraded: 0,
          totalThroughputMbps: 315,
          worstLinkId: CHARLIE,
        }),
      },
      60,
    );
    await fixture.whenStable();

    expect(view.banner()).toBeNull();
    expect(view.rowIds()).toEqual(['lnk_bravo', 'lnk_charlie']);
    expect(view.throughput(BRAVO)).toBe('300 / 400 Mbps');
    expect(view.status(BRAVO)).toBe('up');
    expect(view.kpi('Links')).toBe('2');
    expect(view.kpi('Total throughput')).toBe('315 Mbps');
    expect(view.worstLinkHref()).toBe('/links/lnk_charlie');

    // And the Tick that was half-arrived when the connection went does not
    // resurface behind the Snapshot: its `link.deleted` for Bravo Pass went
    // with the connection it arrived on.
    stream().emit(
      'link.telemetry',
      { tick: 61, ts: AT.tick61, samples: [sample(BRAVO, AT.tick61, 280, 21)] },
      61,
    );
    stream().emit(
      'fleet.summary',
      summary({ total: 2, up: 2, degraded: 0, totalThroughputMbps: 295 }),
      61,
    );
    await fixture.whenStable();

    expect(view.rowIds()).toEqual(['lnk_bravo', 'lnk_charlie']);
    expect(view.throughput(BRAVO)).toBe('280 / 400 Mbps');

    // The other kind of drop: a reply the Server never wrote — the 502
    // something in front of a restarting API answers — closes an EventSource
    // for good, so the browser will not retry this one at all.
    const abandoned = stream();
    abandoned.readyState = 2;
    abandoned.fail();
    await fixture.whenStable();
    expect(view.banner()).not.toBeNull();

    // The Console opens a new stream rather than staying frozen until somebody
    // reloads the page, and that stream's Snapshot resynchronises it.
    await nextMacrotask();
    expect(stream()).not.toBe(abandoned);

    stream().emit(
      'fleet.snapshot',
      {
        tick: 70,
        ts: AT.tick70,
        links: [charlie],
        samples: [sample(CHARLIE, AT.tick70, 20)],
        summary: summary({
          total: 1,
          up: 1,
          degraded: 0,
          totalThroughputMbps: 20,
        }),
      },
      70,
    );
    await fixture.whenStable();

    expect(view.banner()).toBeNull();
    expect(view.rowIds()).toEqual(['lnk_charlie']);
    expect(view.throughput(CHARLIE)).toBe('20 / 200 Mbps');

    // And the connection goes when the application does, rather than outliving
    // it — a stream subscription surviving its own Console is a Leak.
    const live = stream();
    finish();
    expect(live.closed).toBe(true);
  });
});
