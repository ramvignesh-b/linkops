import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ENVIRONMENT } from './environment.token';
import { loadEnvironment } from './load-environment';
import { ServerConfigService } from './server-config.service';

/**
 * The configuration seam: the one place `process.env` is read.
 *
 * `ConfigModule.forRoot` is imported for its `.env`-file loading only —
 * nothing here reads Nest's own `ConfigService`. The validating throw lives
 * in the `ENVIRONMENT` provider's `useFactory` instead of `forRoot`'s
 * `validate` option on purpose: a `@Module()` decorator's arguments —
 * `forRoot`'s call included — evaluate once, the first time this file is
 * imported in the process, never again. A `useFactory` runs at DI
 * instantiation time, which is every `NestFactory.create()` and every
 * `Test.createTestingModule(...).compile()` — the only timing an incoherent
 * environment set *after* this file first loaded, as a test does, is
 * actually caught by.
 *
 * `@Global()` so every feature module that needs `ServerConfigService` —
 * `ServerA2uiAgentModule` choosing its provider, `main.ts` reading the port
 * and the explorer flag — injects it without importing this module a
 * second time.
 */
@Global()
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  providers: [
    { provide: ENVIRONMENT, useFactory: () => loadEnvironment(process.env) },
    ServerConfigService,
  ],
  exports: [ServerConfigService],
})
export class ServerConfigModule {}
