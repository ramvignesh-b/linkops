/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  buildOpenApiDocument,
  mountApiExplorer,
} from '@linkops/server/links-api';
import { ServerConfigService } from '@linkops/server/config';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // This process never calls app.close() itself — enableShutdownHooks() is
  // what registers the SIGTERM/SIGINT listener that does, on a container
  // stop or Ctrl-C. Without it, the process only dies (or is killed), close()
  // never runs, and the Simulator's interval and TelemetryBus never get the
  // chance to stop cleanly. See Simulator.beforeApplicationShutdown.
  app.enableShutdownHooks();
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);

  const config = app.get(ServerConfigService);

  // The generated document is always served, no config flag required — see
  // ADR-0006.
  const openApiDocument = buildOpenApiDocument(app);
  app
    .getHttpAdapter()
    .get(`/${globalPrefix}/openapi.json`, (_req, res) =>
      res.json(openApiDocument),
    );

  // The interactive explorer is gated behind SWAGGER_UI_ENABLED — an
  // unauthenticated, DELETE-capable explorer is a different proposition on a
  // host managing live radio infrastructure than on a developer's laptop.
  // Both this and the raw route above must run before app.listen(), which is
  // what triggers Nest's own init() — see mountApiExplorer's own comment.
  if (config.swaggerUiEnabled) {
    mountApiExplorer(app, openApiDocument);
  }

  await app.listen(config.port);
  Logger.log(
    `🚀 Application is running on: http://localhost:${config.port}/${globalPrefix}`,
  );
}

bootstrap().catch((error: unknown) => {
  // Nest's own Logger is not guaranteed to exist by the time boot fails here
  // — an incoherent environment fails inside NestFactory.create(), before
  // the application graph it would log through is built — so this is
  // console, not Logger, on purpose. See ServerConfigModule.
  console.error(
    `Failed to start: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
