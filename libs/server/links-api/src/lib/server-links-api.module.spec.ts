import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { toLinkId } from '@linkops/shared/domain';
import {
  TELEMETRY_BUS,
  TELEMETRY_SAMPLE_STORE,
} from '@linkops/server/telemetry';
import { ServerLinksApiModule } from './server-links-api.module';

/**
 * Boots the real module — real repository, real validation pipe, real
 * exception filter — fresh for every test, so no test inherits another's
 * fleet. Returns a getter rather than the server itself, because the instance
 * does not exist until `beforeEach` has run.
 */
function useServer(): () => ReturnType<INestApplication['getHttpServer']> {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ServerLinksApiModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    // Harmless where no test faked the clock, and the only thing standing
    // between a frozen `Date` and every later test in the file.
    vi.useRealTimers();
    // Stops Simulator.onModuleInit's setInterval — close() runs the
    // onApplicationShutdown hook chain on its own, whether or not
    // enableShutdownHooks() was ever called; that call only matters for
    // wiring a real OS signal to close(), which no test needs.
    await app.close();
  });

  return () => app.getHttpServer();
}

/**
 * Like `useServer`, but with `Date`/`setInterval`/`clearInterval` faked
 * *before* `app.init()` runs — so the Simulator's `setInterval` call is
 * captured by the fake clock and `vi.advanceTimersByTimeAsync` can drive
 * real Ticks with no sleeps. `setTimeout` stays real, which is what keeps
 * supertest's own request/response cycle working underneath the fake clock.
 */
function useTickingServer(): () => ReturnType<
  INestApplication['getHttpServer']
> {
  let app: INestApplication;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    const moduleRef = await Test.createTestingModule({
      imports: [ServerLinksApiModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    vi.useRealTimers();
  });

  return () => app.getHttpServer();
}

describe('GET /links', () => {
  const server = useServer();

  it('returns the ten seeded Links, each down for want of data', async () => {
    const response = await request(server()).get('/links');

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(10);
    expect(
      response.body.every(
        (link: { status: unknown }) =>
          typeof link.status === 'object' &&
          (link.status as { status: string }).status === 'down' &&
          (link.status as { reason: string }).reason === 'stale',
      ),
    ).toBe(true);
  });
});

describe('GET /links filtering and sorting', () => {
  const server = useServer();

  it('filters by band', async () => {
    const response = await request(server()).get('/links?band=5GHz');

    expect(response.status).toBe(200);
    expect(
      response.body.map((link: { name: string }) => link.name).sort(),
    ).toEqual(
      [
        'North Ridge to Depot',
        'South Ridge Multipoint',
        'East Depot to Yard Two',
      ].sort(),
    );
  });

  it('matches q case-insensitively across name, siteA and siteB', async () => {
    const response = await request(server()).get('/links?q=NORTH RIDGE');

    expect(response.status).toBe(200);
    expect(response.body.map((link: { name: string }) => link.name)).toEqual([
      'North Ridge to Depot',
    ]);
  });

  it('returns the whole fleet for status=down, since every seeded Link is down for want of data', async () => {
    const response = await request(server()).get('/links?status=down');

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(10);
  });

  it('combines band and q rather than one overriding the other', async () => {
    const response = await request(server()).get('/links?band=5GHz&q=depot');

    expect(response.status).toBe(200);
    expect(
      response.body.map((link: { name: string }) => link.name).sort(),
    ).toEqual(['North Ridge to Depot', 'East Depot to Yard Two'].sort());
  });

  it('defaults to name ascending when sort and dir are both absent', async () => {
    const response = await request(server()).get('/links');

    expect(response.body.map((link: { name: string }) => link.name)).toEqual([
      'Control Room to Tower',
      'Depot to Warehouse',
      'East Depot to Yard Two',
      'North Ridge to Depot',
      'South Ridge Multipoint',
      'Substation to Control Room',
      'Tower to East Depot',
      'Warehouse to Yard',
      'Yard to South Ridge',
      'Yard Two Multipoint',
    ]);
  });

  it('sorts by name descending', async () => {
    const response = await request(server()).get('/links?sort=name&dir=desc');

    expect(response.body.map((link: { name: string }) => link.name)).toEqual([
      'Yard Two Multipoint',
      'Yard to South Ridge',
      'Warehouse to Yard',
      'Tower to East Depot',
      'Substation to Control Room',
      'South Ridge Multipoint',
      'North Ridge to Depot',
      'East Depot to Yard Two',
      'Depot to Warehouse',
      'Control Room to Tower',
    ]);
  });

  it('sorts by capacityMbps in both directions', async () => {
    const ascending = await request(server()).get(
      '/links?sort=capacityMbps&dir=asc',
    );
    const descending = await request(server()).get(
      '/links?sort=capacityMbps&dir=desc',
    );

    expect(
      ascending.body.map((link: { capacityMbps: number }) => link.capacityMbps),
    ).toEqual([100, 150, 200, 250, 300, 350, 400, 500, 700, 1000]);
    expect(
      descending.body.map(
        (link: { capacityMbps: number }) => link.capacityMbps,
      ),
    ).toEqual([1000, 700, 500, 400, 350, 300, 250, 200, 150, 100]);
  });

  it('breaks a status tie on id ascending, since every seeded Link is down', async () => {
    const response = await request(server()).get('/links?sort=status');

    expect(response.body.map((link: { id: string }) => link.id)).toEqual([
      'lnk_0001',
      'lnk_0002',
      'lnk_0003',
      'lnk_0004',
      'lnk_0005',
      'lnk_0006',
      'lnk_0007',
      'lnk_0008',
      'lnk_0009',
      'lnk_0010',
    ]);
  });

  it('breaks a throughputMbps tie on id ascending, since no seeded Link has a Sample', async () => {
    const response = await request(server()).get('/links?sort=throughputMbps');

    expect(response.body.map((link: { id: string }) => link.id)).toEqual([
      'lnk_0001',
      'lnk_0002',
      'lnk_0003',
      'lnk_0004',
      'lnk_0005',
      'lnk_0006',
      'lnk_0007',
      'lnk_0008',
      'lnk_0009',
      'lnk_0010',
    ]);
  });

  it('rejects an unknown sort key as 400 VALIDATION_FAILED rather than ignoring it', async () => {
    const response = await request(server()).get('/links?sort=siteA');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects a dir that is neither asc nor desc', async () => {
    const response = await request(server()).get('/links?dir=ascending');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('returns an identical order for two identical requests', async () => {
    const first = await request(server()).get(
      '/links?sort=capacityMbps&dir=desc',
    );
    const second = await request(server()).get(
      '/links?sort=capacityMbps&dir=desc',
    );

    expect(second.body.map((link: { id: string }) => link.id)).toEqual(
      first.body.map((link: { id: string }) => link.id),
    );
  });
});

describe('GET /links/:id/telemetry', () => {
  const server = useServer();

  it('returns an empty array for a seeded Link, since the Simulator has not landed', async () => {
    const response = await request(server()).get(
      '/links/lnk_0001/telemetry?window=5m',
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('defaults window to 5 minutes when the query string omits it', async () => {
    const response = await request(server()).get('/links/lnk_0001/telemetry');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('rejects an unparseable window as 400 VALIDATION_FAILED', async () => {
    const response = await request(server()).get(
      '/links/lnk_0001/telemetry?window=bogus',
    );

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('answers an unknown Link with the project error envelope', async () => {
    const response = await request(server()).get(
      '/links/lnk_9999/telemetry?window=5m',
    );

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: 'LINK_NOT_FOUND',
        message: 'Link lnk_9999 not found',
        details: { id: 'lnk_9999' },
      },
    });
  });
});

describe('GET /fleet/summary', () => {
  const server = useServer();

  it('reports a total matching the seed count, every Link down, and no worst Link', async () => {
    const response = await request(server()).get('/fleet/summary');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      total: 10,
      up: 0,
      degraded: 0,
      down: 10,
      totalThroughputMbps: 0,
      worstLinkId: null,
    });
  });

  it('reflects a created Link in the total on the next read', async () => {
    await request(server()).post('/links').send(validCreateBody);

    const response = await request(server()).get('/fleet/summary');

    expect(response.body.total).toBe(11);
    expect(response.body.down).toBe(11);
  });
});

describe('GET /links/:id', () => {
  const server = useServer();

  it('returns a seeded Link with its most recent reading, null until the Simulator lands', async () => {
    const response = await request(server()).get('/links/lnk_0001');

    expect(response.status).toBe(200);
    expect(response.body.latestSample).toBeNull();
    expect(response.body.link).toMatchObject({
      id: 'lnk_0001',
      name: 'North Ridge to Depot',
      status: { status: 'down', reason: 'stale' },
    });
  });

  it('answers an unknown id with the project error envelope, not a framework default', async () => {
    const response = await request(server()).get('/links/lnk_9999');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: 'LINK_NOT_FOUND',
        message: 'Link lnk_9999 not found',
        details: { id: 'lnk_9999' },
      },
    });
  });
});

const validCreateBody = {
  name: 'New Ridge to Depot',
  siteA: 'New Ridge',
  siteB: 'Depot',
  band: '5GHz',
  mode: 'PtP',
  capacityMbps: 300,
  txPowerDbm: 20,
  channelWidthMhz: 40,
};

describe('POST /links', () => {
  const server = useServer();

  it('creates a Link at version 1 with createdAt and updatedAt set', async () => {
    const response = await request(server())
      .post('/links')
      .send(validCreateBody);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      ...validCreateBody,
      version: 1,
    });
    expect(response.body.createdAt).toEqual(expect.any(String));
    expect(response.body.updatedAt).toEqual(expect.any(String));
  });

  it('appears in a subsequent GET /links', async () => {
    await request(server()).post('/links').send(validCreateBody);

    const response = await request(server()).get('/links');

    expect(
      response.body.some(
        (link: { name: string }) => link.name === validCreateBody.name,
      ),
    ).toBe(true);
  });

  it('rejects an out-of-range capacityMbps with the offending field named', async () => {
    const response = await request(server())
      .post('/links')
      .send({ ...validCreateBody, capacityMbps: 5 });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(response.body.error.details.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'capacityMbps' }),
      ]),
    );
  });

  it('does not honour a status or version set on the request body', async () => {
    const response = await request(server())
      .post('/links')
      .send({
        ...validCreateBody,
        status: { status: 'up' },
        version: 99,
      });

    expect(response.status).toBe(201);
    expect(response.body.version).toBe(1);
    expect(response.body.status).toEqual({ status: 'down', reason: 'stale' });
  });

  it('refuses a duplicate name with the offending name in details', async () => {
    await request(server()).post('/links').send(validCreateBody);

    const response = await request(server())
      .post('/links')
      .send(validCreateBody);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: {
        code: 'LINK_NAME_TAKEN',
        message: expect.any(String),
        details: { name: validCreateBody.name },
      },
    });
  });
});

describe('PATCH /links/:id', () => {
  const server = useServer();

  it('applies an edit carrying the matching version and returns the Link at the next one', async () => {
    const response = await request(server())
      .patch('/links/lnk_0001')
      .send({ version: 1, txPowerDbm: 25 });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: 'lnk_0001',
      txPowerDbm: 25,
      version: 2,
    });
  });

  it('answers a stale version with the whole current Link, so a conflict can be shown field by field', async () => {
    await request(server())
      .patch('/links/lnk_0001')
      .send({ version: 1, txPowerDbm: 25 });

    const response = await request(server())
      .patch('/links/lnk_0001')
      .send({ version: 1, txPowerDbm: 30 });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('LINK_VERSION_CONFLICT');
    expect(response.body.error.details.currentVersion).toBe(2);
    expect(response.body.error.details.current).toMatchObject({
      id: 'lnk_0001',
      name: 'North Ridge to Depot',
      txPowerDbm: 25,
      version: 2,
      status: { status: 'down', reason: 'stale' },
    });
  });

  it('rejects a body with no version through the schema, naming version as the offending field', async () => {
    const response = await request(server())
      .patch('/links/lnk_0001')
      .send({ txPowerDbm: 25 });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(response.body.error.details.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'version' })]),
    );
  });

  it('refuses a rename onto a name another Link already holds', async () => {
    const response = await request(server())
      .patch('/links/lnk_0001')
      .send({ version: 1, name: 'Depot to Warehouse' });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: {
        code: 'LINK_NAME_TAKEN',
        message: expect.any(String),
        details: { name: 'Depot to Warehouse' },
      },
    });
  });

  it('answers an unknown id with the project error envelope', async () => {
    const response = await request(server())
      .patch('/links/lnk_9999')
      .send({ version: 1, txPowerDbm: 25 });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: 'LINK_NOT_FOUND',
        message: 'Link lnk_9999 not found',
        details: { id: 'lnk_9999' },
      },
    });
  });

  // Only `Date` is faked: the real timers have to keep running or the
  // supertest round trip below would never resolve. A frozen clock is the
  // only way to assert `updatedAt` *moved* — two writes landing in the same
  // millisecond produce the same ISO string, which would make this flaky.
  it('moves updatedAt and leaves createdAt where it was', async () => {
    const before = await request(server()).get('/links/lnk_0001');
    const { createdAt, updatedAt } = before.body.link;

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(new Date(updatedAt).getTime() + 60_000));
    const response = await request(server())
      .patch('/links/lnk_0001')
      .send({ version: 1, txPowerDbm: 25 });

    expect(response.body.createdAt).toBe(createdAt);
    expect(response.body.updatedAt).not.toBe(updatedAt);
  });
});

describe('DELETE /links/:id', () => {
  const server = useServer();

  it('returns 204 with no body for a seeded Link', async () => {
    const response = await request(server()).delete('/links/lnk_0001');

    expect(response.status).toBe(204);
    expect(response.body).toEqual({});
  });

  it('answers an unknown id with the project error envelope', async () => {
    const response = await request(server()).delete('/links/lnk_9999');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: 'LINK_NOT_FOUND',
        message: 'Link lnk_9999 not found',
        details: { id: 'lnk_9999' },
      },
    });
  });

  it('removes the Link from a subsequent GET /links and GET /links/:id', async () => {
    await request(server()).delete('/links/lnk_0001');

    const list = await request(server()).get('/links');
    expect(
      list.body.some((link: { id: string }) => link.id === 'lnk_0001'),
    ).toBe(false);

    const read = await request(server()).get('/links/lnk_0001');
    expect(read.status).toBe(404);
  });
});

/**
 * The endpoint-by-endpoint tests above each hold one boundary still. This one
 * runs the sequence an operator actually performs, against one app instance,
 * so a Link created by `POST` is the same Link `GET` reads and `PATCH` edits —
 * the coupling no isolated test can see.
 */
describe('a Link through its lifecycle', () => {
  const server = useServer();

  it('is seeded, created, read, edited, and refuses the second edit at the version the first consumed', async () => {
    const seeded = await request(server()).get('/links');
    expect(seeded.status).toBe(200);
    expect(seeded.body).toHaveLength(10);

    const created = await request(server())
      .post('/links')
      .send(validCreateBody);
    expect(created.status).toBe(201);
    expect(created.body.version).toBe(1);
    const id: string = created.body.id;

    const read = await request(server()).get(`/links/${id}`);
    expect(read.status).toBe(200);
    expect(read.body.latestSample).toBeNull();
    expect(read.body.link).toMatchObject({ id, version: 1 });

    const edited = await request(server())
      .patch(`/links/${id}`)
      .send({ version: 1, capacityMbps: 500 });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ id, capacityMbps: 500, version: 2 });

    const stale = await request(server())
      .patch(`/links/${id}`)
      .send({ version: 1, capacityMbps: 600 });
    expect(stale.status).toBe(409);
    expect(stale.body).toEqual({
      error: {
        code: 'LINK_VERSION_CONFLICT',
        message: expect.any(String),
        details: { currentVersion: 2, current: edited.body },
      },
    });
  });
});

describe('the Simulator writes live Telemetry across real Ticks', () => {
  const server = useTickingServer();

  it('gives GET /links/:id a fresh Sample after a Tick, no longer down: stale', async () => {
    await vi.advanceTimersByTimeAsync(1_000);

    const response = await request(server()).get('/links/lnk_0001');

    expect(response.status).toBe(200);
    expect(response.body.latestSample).not.toBeNull();
    expect(response.body.link.status).not.toEqual({
      status: 'down',
      reason: 'stale',
    });
  });

  it('gives GET /links and GET /links/:id/telemetry live data after a Tick', async () => {
    await vi.advanceTimersByTimeAsync(1_000);

    const list = await request(server()).get('/links');
    const history = await request(server()).get(
      '/links/lnk_0001/telemetry?window=5m',
    );

    expect(
      (list.body as { id: string; status: unknown }[]).find(
        (link) => link.id === 'lnk_0001',
      )?.status,
    ).not.toEqual({ status: 'down', reason: 'stale' });
    expect(history.body).toHaveLength(1);
  });

  it('gives GET /fleet/summary live data across several Ticks', async () => {
    await vi.advanceTimersByTimeAsync(3_000);

    const response = await request(server()).get('/fleet/summary');

    expect(response.body.total).toBe(10);
    expect(response.body.down).toBeLessThan(10);
    expect(response.body.worstLinkId).not.toBeNull();

    const history = await request(server()).get(
      '/links/lnk_0001/telemetry?window=5m',
    );
    expect(history.body).toHaveLength(3);
  });

  it('produces no orphaned Sample for a deleted Link on a subsequent Tick', async () => {
    await vi.advanceTimersByTimeAsync(1_000);

    await request(server()).delete('/links/lnk_0001');
    await vi.advanceTimersByTimeAsync(1_000);

    const summary = await request(server()).get('/fleet/summary');
    expect(summary.body.total).toBe(9);

    const read = await request(server()).get('/links/lnk_0001');
    expect(read.status).toBe(404);
  });
});

describe('shutdown stops both leak sources', () => {
  it('stops producing Samples and completes the TelemetryBus once app.close() has run', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    const moduleRef = await Test.createTestingModule({
      imports: [ServerLinksApiModule],
    }).compile();
    const app = moduleRef.createNestApplication();
    // Mirrors apps/api/main.ts's own wiring — not load-bearing for this
    // test's assertions, since close() runs onApplicationShutdown either way.
    app.enableShutdownHooks();
    await app.init();
    let busCompleted = false;
    moduleRef
      .get(TELEMETRY_BUS)
      .asObservable()
      .subscribe({ complete: () => (busCompleted = true) });

    await vi.advanceTimersByTimeAsync(1_000);
    const beforeShutdown = await request(app.getHttpServer()).get(
      '/links/lnk_0001/telemetry?window=5m',
    );

    await app.close();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(busCompleted).toBe(true);
    // The app is closed, so a further HTTP assertion isn't available; the
    // TelemetrySampleStore itself is what proves no further Sample landed.
    const store = moduleRef.get(TELEMETRY_SAMPLE_STORE);
    expect(
      store.history(
        toLinkId('lnk_0001'),
        Infinity,
        new Date(8_640_000_000_000_000),
      ),
    ).toHaveLength(beforeShutdown.body.length);

    vi.useRealTimers();
  });
});
