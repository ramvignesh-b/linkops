import { Module } from '@nestjs/common';
import {
  LINK_REPOSITORY,
  ServerLinksDataAccessModule,
  type LinkRepository,
} from '@linkops/server/links-data-access';
import {
  ServerTelemetryModule,
  systemClock,
  TELEMETRY_PORT,
  type TelemetryPort,
} from '@linkops/server/telemetry';
import { A2UI_AGENT } from './a2ui-agent.token';
import { AgentUiController } from './agent-ui.controller';
import { StubTriageAgent } from './stub-triage-agent';

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
  imports: [ServerLinksDataAccessModule, ServerTelemetryModule],
  controllers: [AgentUiController],
  providers: [
    {
      provide: A2UI_AGENT,
      // The seam configuration selects an implementation at. Today there is
      // one, and it is the one that runs for someone who cloned this
      // repository and holds no credentials.
      useFactory: (repository: LinkRepository, telemetry: TelemetryPort) =>
        new StubTriageAgent(repository, telemetry, systemClock),
      inject: [LINK_REPOSITORY, TELEMETRY_PORT],
    },
  ],
})
export class ServerA2uiAgentModule {}
