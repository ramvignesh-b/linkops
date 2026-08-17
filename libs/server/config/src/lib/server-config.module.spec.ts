import { Test } from '@nestjs/testing';
import { ServerConfigModule } from './server-config.module';
import { ServerConfigService } from './server-config.service';

/**
 * The Nest-level half of `loadEnvironment`'s contract: that
 * `ConfigModule.forRoot({ validate: loadEnvironment })` really does turn a
 * thrown validation error into a rejected module compile, and that a
 * coherent environment resolves into a typed `ServerConfigService` rather
 * than a bag of strings. `loadEnvironment.spec.ts` covers every coherence
 * rule as a pure function; this file only has to prove the wiring.
 */
describe('ServerConfigModule', () => {
  const ENV_KEYS = [
    'PORT',
    'SWAGGER_UI_ENABLED',
    'ASSISTANT_PROVIDER',
    'ASSISTANT_PROVIDER_KEY',
  ] as const;
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      original[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
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
    process.env['ASSISTANT_PROVIDER'] = 'model';

    await expect(
      Test.createTestingModule({ imports: [ServerConfigModule] }).compile(),
    ).rejects.toThrow(/ASSISTANT_PROVIDER_KEY/);
  });

  it('resolves a coherent, non-default environment', async () => {
    process.env['PORT'] = '8080';
    process.env['SWAGGER_UI_ENABLED'] = 'true';
    process.env['ASSISTANT_PROVIDER'] = 'model';
    process.env['ASSISTANT_PROVIDER_KEY'] = 'sk-dummy';

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
