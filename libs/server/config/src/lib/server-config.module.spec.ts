import { Test } from '@nestjs/testing';
import { ServerConfigModule } from './server-config.module';
import { ServerConfigService } from './server-config.service';

/**
 * The Nest-level half of `loadEnvironment`'s contract: that the
 * `ENVIRONMENT` provider's `useFactory` really does turn a thrown
 * validation error into a rejected module compile, and that a coherent
 * environment resolves into a typed `ServerConfigService` rather than a bag
 * of strings. `loadEnvironment.spec.ts` covers every coherence rule as a
 * pure function; this file only has to prove the wiring.
 */
describe('ServerConfigModule', () => {
  const ENV_KEYS = [
    'PORT',
    'SWAGGER_UI_ENABLED',
    'ASSISTANT_PROVIDER',
    'ASSISTANT_PROVIDER_KEY',
  ] as const;

  beforeEach(() => {
    for (const key of ENV_KEYS) vi.stubEnv(key, undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('boots on an empty environment and resolves the stub provider', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ServerConfigModule],
    }).compile();

    const config = moduleRef.get(ServerConfigService);

    expect(config.port).toBe(3000);
    expect(config.swaggerUiEnabled).toBe(false);
    expect(config.assistantProvider).toBe('stub');
    expect(config.assistantProviderKey).toBeUndefined();

    await moduleRef.close();
  });

  it('rejects compilation on an incoherent environment, naming the variable', async () => {
    vi.stubEnv('ASSISTANT_PROVIDER', 'model');

    await expect(
      Test.createTestingModule({ imports: [ServerConfigModule] }).compile(),
    ).rejects.toThrow(/ASSISTANT_PROVIDER_KEY/);
  });

  it('resolves a coherent, non-default environment', async () => {
    vi.stubEnv('PORT', '8080');
    vi.stubEnv('SWAGGER_UI_ENABLED', 'true');
    vi.stubEnv('ASSISTANT_PROVIDER', 'model');
    vi.stubEnv('ASSISTANT_PROVIDER_KEY', 'sk-dummy');

    const moduleRef = await Test.createTestingModule({
      imports: [ServerConfigModule],
    }).compile();

    const config = moduleRef.get(ServerConfigService);

    expect(config.port).toBe(8080);
    expect(config.swaggerUiEnabled).toBe(true);
    expect(config.assistantProvider).toBe('model');
    expect(config.assistantProviderKey).toBe('sk-dummy');

    await moduleRef.close();
  });
});
