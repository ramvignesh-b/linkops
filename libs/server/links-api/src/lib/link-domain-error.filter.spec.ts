import { Controller, Get, Module, type INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { LinkDomainErrorFilter } from './link-domain-error.filter';

// A throwaway controller, local to this spec, whose only job is to throw an
// error the filter does not recognise — the real controllers never do this.
@Controller('boom')
class BoomController {
  @Get()
  boom(): never {
    throw new Error('an error the filter does not know about');
  }
}

@Module({
  controllers: [BoomController],
  providers: [{ provide: APP_FILTER, useClass: LinkDomainErrorFilter }],
})
class BoomModule {}

describe('LinkDomainErrorFilter', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [BoomModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('passes an unrecognised error through unwrapped, never synthesising an envelope', async () => {
    const response = await request(app.getHttpServer()).get('/boom');

    expect(response.status).toBe(500);
    expect(response.body).not.toHaveProperty('error');
  });
});
