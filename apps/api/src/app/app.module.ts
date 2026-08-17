import { Module } from '@nestjs/common';
import { ServerA2uiAgentModule } from '@linkops/server/a2ui-agent';
import { ServerConfigModule } from '@linkops/server/config';
import { ServerLinksApiModule } from '@linkops/server/links-api';
import { ServerStreamApiModule } from '@linkops/server/stream-api';

/**
 * `ServerConfigModule` is imported here explicitly, not only transitively
 * through `ServerA2uiAgentModule` — so that compiling `AppModule` alone (as
 * `app.module.spec.ts`'s boot-behaviour tests do) enforces environment
 * coherence regardless of which feature module happens to need
 * `ServerConfigService`. `main.ts` validates the environment itself before
 * this module is ever touched — see its own top comment — this import is
 * what makes the same guarantee hold for anything that boots `AppModule`
 * directly, tests included.
 *
 * The scaffolded `AppController`/`AppService` ("Hello API" at `GET /api`)
 * are gone as of this module: nothing referenced them, no test asserted
 * them, and they occupied the same root path `mountApiExplorer` mounts the
 * Swagger explorer at — an undocumented placeholder silently shadowing the
 * real API surface's root is exactly the kind of ambiguity this ticket's
 * fail-fast, no-silent-fallback stance argues against.
 */
@Module({
  imports: [
    ServerConfigModule,
    ServerLinksApiModule,
    ServerStreamApiModule,
    ServerA2uiAgentModule,
  ],
})
export class AppModule {}
