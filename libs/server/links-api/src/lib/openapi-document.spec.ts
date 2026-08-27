import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { ServerLinksApiModule } from './server-links-api.module';
import {
  buildOpenApiDocument,
  mountApiExplorer,
  resolveForwardedPrefix,
  withBasePath,
} from './openapi-document';

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

describe('resolveForwardedPrefix', () => {
  it('reads the prefix a reverse proxy declares', () => {
    expect(resolveForwardedPrefix({ 'x-forwarded-prefix': '/linkops' })).toBe(
      '/linkops',
    );
  });

  it('takes the first value when the header arrives repeated', () => {
    expect(
      resolveForwardedPrefix({ 'x-forwarded-prefix': ['/linkops', '/other'] }),
    ).toBe('/linkops');
  });

  it('normalises a missing leading slash and a trailing one', () => {
    expect(resolveForwardedPrefix({ 'x-forwarded-prefix': 'linkops/' })).toBe(
      '/linkops',
    );
  });

  // A proxy that mounts the API at the root has nothing to declare, and a
  // `servers: [{ url: '/' }]` entry is not harmless: Swagger UI would resolve
  // every operation against it and produce a doubled slash.
  it.each(['', '   ', '/', '//'])(
    'treats %o as no prefix at all',
    (header: string) => {
      expect(
        resolveForwardedPrefix({ 'x-forwarded-prefix': header }),
      ).toBeUndefined();
    },
  );

  it('is undefined when the proxy sends no such header', () => {
    expect(
      resolveForwardedPrefix({ referer: 'https://host/linkops/api/' }),
    ).toBeUndefined();
  });

  it('is undefined when there are no headers at all', () => {
    expect(resolveForwardedPrefix(undefined)).toBeUndefined();
  });
});

describe('withBasePath', () => {
  const document = { openapi: '3.0.0', paths: {} } as never;

  it('declares the prefix as the only server', () => {
    expect(withBasePath(document, '/linkops')).toMatchObject({
      servers: [{ url: '/linkops' }],
    });
  });

  it('leaves the document alone when there is no prefix', () => {
    expect(withBasePath(document, undefined)).not.toHaveProperty('servers');
  });

  it('never mutates the shared boot-time document', () => {
    withBasePath(document, '/linkops');

    expect(document).not.toHaveProperty('servers');
  });
});

/**
 * These assert against `swagger-ui-init.js` — the file the explorer page
 * actually loads, with the document inlined into it — rather than against the
 * document object, because the bug they exist to catch lives entirely in how
 * the options reach @nestjs/swagger. `SwaggerCustomOptions` declares
 * `patchDocumentOnRequest` at the top level; every read site in 11.4.6's
 * implementation looks for it under `swaggerOptions`. Passing it the way the
 * type describes typechecks cleanly, throws nothing, and silently never runs.
 * Only the served artefact shows the difference.
 */
describe('the explorer under a path prefix', () => {
  async function initJs(headers: Record<string, string>): Promise<string> {
    const moduleRef = await Test.createTestingModule({
      imports: [ServerLinksApiModule],
    }).compile();
    const freshApp = moduleRef.createNestApplication();

    mountApiExplorer(freshApp, buildOpenApiDocument(freshApp));
    await freshApp.init();

    const response = await request(freshApp.getHttpServer())
      .get('/api/swagger-ui-init.js')
      .set(headers);
    await freshApp.close();

    return response.text;
  }

  it('declares X-Forwarded-Prefix as the server, so operations resolve under it', async () => {
    const js = await initJs({ 'X-Forwarded-Prefix': '/linkops' });

    expect(js).toMatch(/"servers":\s*\[\s*\{\s*"url":\s*"\/linkops"\s*\}\s*\]/);
  });

  // `DocumentBuilder.build()` always emits a `servers` key, so the no-prefix
  // state is an empty array rather than an absent key — and an empty array is
  // exactly what makes Swagger UI resolve operations against the origin root,
  // which is the 404 this whole mechanism exists to prevent.
  it('leaves servers empty when nothing forwarded a prefix', async () => {
    const js = await initJs({});

    expect(js).toMatch(/"servers":\s*\[\s*\]/);
  });

  // The header is the braces; this is the belt. Nothing sets
  // X-Forwarded-Prefix by default, so the explorer has to be able to work out
  // its own mount point in the browser from `window.location`.
  it('ships a request interceptor that can recover the prefix client-side', async () => {
    const js = await initJs({});

    expect(js).toContain('requestInterceptor');
    expect(js).toContain('window.location.pathname');
  });
});
