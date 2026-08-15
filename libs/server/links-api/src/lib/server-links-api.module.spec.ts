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
