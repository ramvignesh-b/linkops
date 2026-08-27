/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import 'tslib';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  buildOpenApiDocument,
  mountApiExplorer,
  resolveForwardedPrefix,
  withBasePath,
} from '@linkops/server/links-api';
import { loadEnvironment } from '@linkops/server/config';
import { AppModule } from './app/app.module';

async function bootstrap() {
  // Validated before Nest touches anything. `ServerConfigModule` runs this
  // same check again at DI-instantiation time — that copy is what makes an
  // incoherent environment fail `Test.createTestingModule(...).compile()`
  // too, for any module built out of Nest's own hands — but running it here
  // first is what keeps a bad environment from ever reaching Nest's Logger
  // and exception machinery: the failure this prints is the one clean line
  // in the catch below, not a stack trace through NestFactory's internals.
  const environment = loadEnvironment();

  const app = await NestFactory.create(AppModule);
  // This process never calls app.close() itself — enableShutdownHooks() is
  // what registers the SIGTERM/SIGINT listener that does, on a container
  // stop or Ctrl-C. Without it, the process only dies (or is killed), close()
  // never runs, and the Simulator's interval and TelemetryBus never get the
  // chance to stop cleanly. See Simulator.beforeApplicationShutdown.
  app.enableShutdownHooks();
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);

  // The generated document is always served, no config flag required — see
  // ADR-0006. `servers` is resolved per request rather than baked in at boot:
  // the same image is served at the root locally and under a path prefix
  // behind a reverse proxy, and only the proxy knows which. See
  // `resolveForwardedPrefix`.
  const openApiDocument = buildOpenApiDocument(app);
  app.getHttpAdapter().get(`/${globalPrefix}/openapi.json`, (req, res) => {
    // Generated per request, same as `swagger-ui-init.js` — see the note in
    // `mountApiExplorer`. Nothing between here and the Client may cache it.
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    const prefix = resolveForwardedPrefix(req.headers);
    Logger.log(
      `raw document: host=${String(req.headers['host'] ?? '?')} ` +
        `x-forwarded-prefix=${String(req.headers['x-forwarded-prefix'] ?? '(unset)')} ` +
        `-> servers=${prefix ?? '(none)'}`,
      'OpenApi',
    );
    res.json(withBasePath(openApiDocument, prefix));
  });

  // The interactive explorer is gated behind SWAGGER_UI_ENABLED — an
  // unauthenticated, DELETE-capable explorer is a different proposition on a
  // host managing live radio infrastructure than on a developer's laptop.
  // Both this and the raw route above must run before app.listen(), which is
  // what triggers Nest's own init() — see mountApiExplorer's own comment.
  if (environment.SWAGGER_UI_ENABLED) {
    mountApiExplorer(app, openApiDocument);
  }

  await app.listen(environment.API_PORT);
  Logger.log(
    `🚀 Application is running on: http://localhost:${environment.API_PORT}/${globalPrefix}`,
  );
  // Printed unconditionally at boot so a live deployment can be told apart
  // from a stale image without reproducing anything: if this line is absent
  // from the logs, the running container predates the base-path work and no
  // amount of proxy configuration will change what the explorer does.
  Logger.log(
    `raw document at /${globalPrefix}/openapi.json; explorer ` +
      `${environment.SWAGGER_UI_ENABLED ? `at /${globalPrefix}` : 'disabled'}; ` +
      'base path from X-Forwarded-Prefix, with a browser-side fallback',
    'OpenApi',
  );
}

bootstrap().catch((error: unknown) => {
  // Nest's own Logger may not exist yet when boot fails this early —
  // loadEnvironment runs before NestFactory.create() ever touches Nest's own
  // logging — so this is console, not Logger, on purpose.
  console.error(
    `Failed to start: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
