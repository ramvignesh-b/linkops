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
 * the interactive explorer stays unmounted until ticket `05`'s
 * `SWAGGER_UI_ENABLED` config flag lands.
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
