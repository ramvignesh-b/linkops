import { Module } from '@nestjs/common';
import {
  ServerConfigModule,
  ServerConfigService,
} from '@linkops/server/config';
import {
  LINK_REPOSITORY,
  ServerLinksDataAccessModule,
  type LinkRepository,
} from '@linkops/server/links-data-access';
import {
  ServerTelemetryModule,
  TELEMETRY_PORT,
  type TelemetryPort,
} from '@linkops/server/telemetry';
import { A2UI_AGENT } from './a2ui-agent.token';
import { AgentUiController } from './agent-ui.controller';
import { selectA2uiAgent } from './select-a2ui-agent';

/**
 * The Assistant's HTTP surface and the agent behind it. It reads the Roster
 * and Telemetry through the same providers every other feature shares, so
 * the Fleet it reasons about is the Fleet the Console is looking at.
 *
 * It registers no global pipe or filter of its own. Validation and the error
 * envelope are application-wide concerns, provided once by
 * `ServerLinksApiModule`, and a second registration would run the same pipe
 * twice on every request in the assembled app. What that costs is that this
 * endpoint's malformed-body behaviour can only be asserted where both
 * modules are wired — `apps/api` — which is where that test lives.
 */
@Module({
  imports: [
    ServerLinksDataAccessModule,
    ServerTelemetryModule,
    ServerConfigModule,
  ],
  controllers: [AgentUiController],
  providers: [
    {
      provide: A2UI_AGENT,
      // `selectA2uiAgent` throws for a provider this repository names but
      // does not ship — that throw runs here, at DI instantiation time, so
      // an unshippable choice fails the boot rather than falling back to
      // the stub silently.
      useFactory: (
        repository: LinkRepository,
        telemetry: TelemetryPort,
        config: ServerConfigService,
      ) =>
        selectA2uiAgent(
          config.assistantProvider,
          repository,
          telemetry,
          config.assistantProviderKey,
          config.assistantModel,
        ),
      inject: [LINK_REPOSITORY, TELEMETRY_PORT, ServerConfigService],
    },
  ],
})
export class ServerA2uiAgentModule {}
