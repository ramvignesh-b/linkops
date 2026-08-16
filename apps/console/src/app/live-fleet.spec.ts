import {
  toLinkId,
  type FleetSummary,
  type Link,
  type TelemetrySample,
} from '@linkops/shared/domain';
import {
  answerFirstPaint,
  bootConsole,
  finish,
  nextMacrotask,
  screen,
} from './testing/console-harness';

const AT = {
  load: '2026-08-16T10:00:00.000Z',
  tick41: '2026-08-16T10:00:41.000Z',
  tick42: '2026-08-16T10:00:42.000Z',
  tick43: '2026-08-16T10:00:43.000Z',
  tick60: '2026-08-16T10:01:00.000Z',
  tick61: '2026-08-16T10:01:01.000Z',
  tick70: '2026-08-16T10:01:10.000Z',
} as const;

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
    expect(view.summary('Total throughput')).toBe('61 Mbps');

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
    expect(view.summary('Links')).toBe('2');
    expect(view.summary('Up')).toBe('1');
    expect(view.summary('Degraded')).toBe('0');
    expect(view.summary('Down')).toBe('1');
    expect(view.summary('Total throughput')).toBe('45 Mbps');
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
    expect(view.summary('Links')).toBe('3');
    expect(view.summary('Up')).toBe('2');
    expect(view.summary('Total throughput')).toBe('225 Mbps');

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
    expect(view.summary('Down')).toBe('0');
    // The header freezes with the rows, so the two still agree.
    expect(view.summary('Total throughput')).toBe('252 Mbps');

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
    expect(view.summary('Links')).toBe('2');
    expect(view.summary('Total throughput')).toBe('315 Mbps');
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
