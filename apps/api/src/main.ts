/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { buildOpenApiDocument } from '@linkops/server/links-api';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);

  // The generated document is always served, no config flag required — see
  // ADR-0006. The interactive explorer (`SwaggerModule.setup`) stays
  // unmounted until ticket 05's `SWAGGER_UI_ENABLED` lands.
  const openApiDocument = buildOpenApiDocument(app);
  app
    .getHttpAdapter()
    .get(`/${globalPrefix}/openapi.json`, (_req, res) =>
      res.json(openApiDocument),
    );

  const port = process.env.PORT || 3000;
  await app.listen(port);
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
}

bootstrap();
