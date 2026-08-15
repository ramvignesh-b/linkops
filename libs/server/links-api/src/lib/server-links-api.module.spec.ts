import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ServerLinksApiModule } from './server-links-api.module';

describe('GET /links', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ServerLinksApiModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns the ten seeded Links, each down for want of data', async () => {
    const response = await request(app.getHttpServer()).get('/links');

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

describe('GET /links/:id', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ServerLinksApiModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns a seeded Link with its most recent reading, null until the Simulator lands', async () => {
    const response = await request(app.getHttpServer()).get('/links/lnk_0001');

    expect(response.status).toBe(200);
    expect(response.body.latestSample).toBeNull();
    expect(response.body.link).toMatchObject({
      id: 'lnk_0001',
      name: 'North Ridge to Depot',
      status: { status: 'down', reason: 'stale' },
    });
  });

  it('answers an unknown id with the project error envelope, not a framework default', async () => {
    const response = await request(app.getHttpServer()).get('/links/lnk_9999');

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
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ServerLinksApiModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates a Link at version 1 with createdAt and updatedAt set', async () => {
    const response = await request(app.getHttpServer())
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
    await request(app.getHttpServer()).post('/links').send(validCreateBody);

    const response = await request(app.getHttpServer()).get('/links');

    expect(
      response.body.some(
        (link: { name: string }) => link.name === validCreateBody.name,
      ),
    ).toBe(true);
  });

  it('rejects an out-of-range capacityMbps with the offending field named', async () => {
    const response = await request(app.getHttpServer())
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
    const response = await request(app.getHttpServer())
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
    await request(app.getHttpServer()).post('/links').send(validCreateBody);

    const response = await request(app.getHttpServer())
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
