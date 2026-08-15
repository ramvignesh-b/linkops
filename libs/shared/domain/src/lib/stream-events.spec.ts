import {
  fleetSnapshotSchema,
  linkDeletedEventSchema,
  linkStatusEventSchema,
  linkTelemetryEventSchema,
  streamEventSchema,
} from './stream-events';

const sample = {
  linkId: 'lnk_0001',
  ts: '2026-01-01T00:00:00.000Z',
  rssiDbm: -50,
  snrDb: 20,
  throughputMbps: 180,
};

const summary = {
  total: 1,
  up: 1,
  degraded: 0,
  down: 0,
  totalThroughputMbps: 180,
  worstLinkId: 'lnk_0001',
};

const link = {
  id: 'lnk_0001',
  name: 'North Ridge to Depot',
  siteA: 'North Ridge',
  siteB: 'Depot',
  band: '5GHz',
  mode: 'PtP',
  capacityMbps: 300,
  txPowerDbm: 20,
  channelWidthMhz: 40,
  status: { status: 'up' },
  version: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const snapshot = {
  tick: 412,
  ts: '2026-01-01T00:00:00.000Z',
  links: [link],
  samples: [sample],
  summary,
};

describe('linkTelemetryEventSchema', () => {
  it('accepts a Tick carrying every Link’s Sample as an array element', () => {
    const result = linkTelemetryEventSchema.safeParse({
      tick: 412,
      ts: '2026-01-01T00:00:00.000Z',
      samples: [sample],
    });

    expect(result.success).toBe(true);
  });

  it('accepts a Tick that produced no Samples, for a Fleet with no Links', () => {
    const result = linkTelemetryEventSchema.safeParse({
      tick: 1,
      ts: '2026-01-01T00:00:00.000Z',
      samples: [],
    });

    expect(result.success).toBe(true);
  });

  it('rejects a Sample that is not the shape the REST surface returns', () => {
    const { snrDb: _dropped, ...withoutSnr } = sample;
    const result = linkTelemetryEventSchema.safeParse({
      tick: 412,
      ts: '2026-01-01T00:00:00.000Z',
      samples: [withoutSnr],
    });

    expect(result.success).toBe(false);
  });
});

describe('fleetSnapshotSchema', () => {
  it('accepts the Roster, the latest Sample per Link and the Summary together', () => {
    expect(fleetSnapshotSchema.safeParse(snapshot).success).toBe(true);
  });

  it('accepts tick 0, for a connection opened before the first Tick', () => {
    const result = fleetSnapshotSchema.safeParse({
      ...snapshot,
      tick: 0,
      links: [],
      samples: [],
      summary: { ...summary, total: 0, up: 0, worstLinkId: null },
    });

    expect(result.success).toBe(true);
  });
});

describe('linkDeletedEventSchema', () => {
  it('accepts the id of the Link that vanished from the Roster', () => {
    const result = linkDeletedEventSchema.safeParse({ linkId: 'lnk_0001' });

    expect(result.success).toBe(true);
  });
});

describe('linkStatusEventSchema', () => {
  it('accepts a transition carrying both the new Status and the one it replaced', () => {
    const result = linkStatusEventSchema.safeParse({
      linkId: 'lnk_0001',
      status: { status: 'down', reason: 'metrics' },
      previous: { status: 'up' },
    });

    expect(result.success).toBe(true);
  });

  it('rejects a status missing the reason a down transition requires', () => {
    const result = linkStatusEventSchema.safeParse({
      linkId: 'lnk_0001',
      status: { status: 'down' },
      previous: { status: 'up' },
    });

    expect(result.success).toBe(false);
  });
});

describe('streamEventSchema', () => {
  it('discriminates each event in the catalogue by its name', () => {
    expect(
      streamEventSchema.safeParse({ event: 'fleet.snapshot', data: snapshot })
        .success,
    ).toBe(true);
    expect(
      streamEventSchema.safeParse({
        event: 'link.telemetry',
        data: { tick: 412, ts: sample.ts, samples: [sample] },
      }).success,
    ).toBe(true);
    expect(
      streamEventSchema.safeParse({ event: 'fleet.summary', data: summary })
        .success,
    ).toBe(true);
    expect(
      streamEventSchema.safeParse({ event: 'link.created', data: link })
        .success,
    ).toBe(true);
    expect(
      streamEventSchema.safeParse({ event: 'link.updated', data: link })
        .success,
    ).toBe(true);
    expect(
      streamEventSchema.safeParse({
        event: 'link.deleted',
        data: { linkId: 'lnk_0001' },
      }).success,
    ).toBe(true);
    expect(
      streamEventSchema.safeParse({
        event: 'link.status',
        data: {
          linkId: 'lnk_0001',
          status: { status: 'up' },
          previous: { status: 'down', reason: 'stale' },
        },
      }).success,
    ).toBe(true);
  });

  it('rejects an event name outside the catalogue', () => {
    const result = streamEventSchema.safeParse({
      event: 'link.telepathy',
      data: summary,
    });

    expect(result.success).toBe(false);
  });

  it('rejects a payload belonging to a different event in the catalogue', () => {
    const result = streamEventSchema.safeParse({
      event: 'fleet.summary',
      data: snapshot,
    });

    expect(result.success).toBe(false);
  });
});
