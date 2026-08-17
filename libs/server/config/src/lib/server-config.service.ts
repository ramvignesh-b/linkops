import { Inject, Injectable } from '@nestjs/common';
import { ENVIRONMENT } from './environment.token';
import type { AssistantProvider, Environment } from './environment.schema';

/**
 * The typed face of this application's configuration — everything outside
 * this library reads the four variables through this, never through
 * `process.env` directly.
 */
@Injectable()
export class ServerConfigService {
  constructor(@Inject(ENVIRONMENT) private readonly environment: Environment) {}

  get port(): number {
    return this.environment.PORT;
  }

  get swaggerUiEnabled(): boolean {
    return this.environment.SWAGGER_UI_ENABLED;
  }

  get assistantProvider(): AssistantProvider {
    return this.environment.ASSISTANT_PROVIDER;
  }

  /** `undefined` whenever `assistantProvider` is `'stub'` — never logged, never sent to the Console. */
  get assistantProviderKey(): string | undefined {
    return this.environment.ASSISTANT_PROVIDER_KEY;
  }
}
