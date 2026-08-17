import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { ServerLinksApiModule } from './server-links-api.module';
import { buildOpenApiDocument, mountApiExplorer } from './openapi-document';

/**
 * Boots the real module — same as `server-links-api.module.spec.ts` — so the
 * document under test is assembled from the real controllers and DTOs, not a
 * stand-in.
 */
function useApp(): () => INestApplication {
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

  return () => app;
}

describe('buildOpenApiDocument', () => {
  const app = useApp();

  it('covers all seven endpoints of the Foundation slice', () => {
    const document = buildOpenApiDocument(app());

    expect(document.paths['/links']).toHaveProperty('get');
    expect(document.paths['/links']).toHaveProperty('post');
    expect(document.paths['/links/{id}']).toHaveProperty('get');
    expect(document.paths['/links/{id}']).toHaveProperty('patch');
    expect(document.paths['/links/{id}']).toHaveProperty('delete');
    expect(document.paths['/links/{id}/telemetry']).toHaveProperty('get');
    expect(document.paths['/fleet/summary']).toHaveProperty('get');
  });

  it("derives the Link response schema from linkSchema's own ranges, not a hand-written shape", () => {
    const document = buildOpenApiDocument(app());
    const schema = document.components?.schemas?.[
      'LinkDto_Output'
    ] as SchemaObject;

    expect(schema.properties?.['capacityMbps']).toMatchObject({
      minimum: 10,
      maximum: 1000,
    });
    expect(schema.properties?.['name']).toMatchObject({
      minLength: 3,
      maxLength: 40,
    });
  });

  it('describes the error envelope with every member of the closed code union', () => {
    const document = buildOpenApiDocument(app());
    const schema = document.components?.schemas?.[
      'ApiErrorEnvelopeDto'
    ] as SchemaObject;
    const errorArms = (schema.properties?.['error'] as SchemaObject)
      .oneOf as SchemaObject[];
    const codes = errorArms.map(
      (arm) => (arm.properties?.['code'] as SchemaObject).enum?.[0],
    );

    expect(codes.sort()).toEqual(
      [
        'LINK_NOT_FOUND',
        'LINK_VERSION_CONFLICT',
        'LINK_NAME_TAKEN',
        'VALIDATION_FAILED',
        'A2UI_INVALID_PAYLOAD',
      ].sort(),
    );
  });

  it('states the message-is-diagnostic rule in the envelope schema, not only the README', () => {
    const document = buildOpenApiDocument(app());
    const schema = document.components?.schemas?.[
      'ApiErrorEnvelopeDto'
    ] as SchemaObject;
    const firstArm = (
      (schema.properties?.['error'] as SchemaObject).oneOf as SchemaObject[]
    )[0];

    expect(
      (firstArm.properties?.['message'] as SchemaObject).description,
    ).toMatch(/diagnostic/i);
  });

  it('never mounts the interactive Swagger explorer on its own', async () => {
    buildOpenApiDocument(app());

    // 'api' is the customary `SwaggerModule.setup(path, app, document)` mount
    // point. Building the document must never register it on its own — the
    // explorer only mounts when `main.ts` calls `mountApiExplorer`, gated
    // behind `SWAGGER_UI_ENABLED`.
    const response = await request(app().getHttpServer()).get('/api');

    expect(response.status).toBe(404);
  });

  // A fresh app, not `useApp()`'s already-`init()`ed one: `mountApiExplorer`
  // has to register its route before `app.init()` runs, the same way
  // `main.ts` calls it between `NestFactory.create()` and `app.listen()`.
  // `init()` is what registers Nest's own catch-all "not found" handler as
  // the Express app's terminal middleware — a route added after that point
  // is present in the router's stack but never reached, because that
  // handler always answers first.
  it('mounts the interactive Swagger explorer when mountApiExplorer is called before init', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ServerLinksApiModule],
    }).compile();
    const freshApp = moduleRef.createNestApplication();

    const document = buildOpenApiDocument(freshApp);
    mountApiExplorer(freshApp, document);
    await freshApp.init();

    const response = await request(freshApp.getHttpServer()).get('/api');
    await freshApp.close();

    expect(response.status).not.toBe(404);
  });
});
