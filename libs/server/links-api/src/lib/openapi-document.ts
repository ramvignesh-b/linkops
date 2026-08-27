import type { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
} from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';

/**
 * Assembles the OpenAPI document from the app's own controllers and DTOs —
 * the same `createZodDto`-generated classes the endpoints validate with, so
 * this document cannot describe an API that does not exist. See ADR-0006.
 *
 * Only the document is built here. Nothing calls `SwaggerModule.setup()` —
 * that is `mountApiExplorer`, below, and it is the caller's choice whether
 * to call it at all.
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('LinkOps API')
    .setDescription(
      "LinkOps Console's REST surface for the Fleet of Links. Every request and response shape here is generated from the shared zod schemas the server validates with (ADR-0006), including the error envelope: `message` is diagnostic — for logs and API consumers, never for an operator.",
    )
    .setVersion('1.0')
    .build();

  return cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));
}

/**
 * Mounts the interactive Swagger explorer at `GET /api`, over a document
 * `buildOpenApiDocument` already built. Split out from that function so
 * `main.ts` can gate the call behind `SWAGGER_UI_ENABLED` — an
 * unauthenticated, `DELETE`-capable explorer is a different proposition on
 * a host managing live radio infrastructure than on a developer's laptop —
 * while `GET /api/openapi.json` stays served unconditionally either way.
 *
 * Call this before `app.init()` / `app.listen()`, never after. `init()` is
 * what registers Nest's own catch-all "not found" handler as the terminal
 * Express middleware; a route added afterwards is present in the router's
 * stack but never reached, because that handler always answers first.
 */
export function mountApiExplorer(
  app: INestApplication,
  document: OpenAPIObject,
): void {
  SwaggerModule.setup('api', app, document, {
    swaggerOptions: {
      // Force Swagger UI to fetch the custom endpoint mounted in main.ts
      // instead of its default absolute path, so X-Forwarded-Prefix is applied
      url: './openapi.json',
    },
  });
}
