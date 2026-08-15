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
