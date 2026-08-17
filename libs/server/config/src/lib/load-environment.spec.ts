import { loadEnvironment } from './load-environment';

/**
 * `loadEnvironment` is the seam `ConfigModule.forRoot({ validate })` calls —
 * see ADR discussion in the module: throwing here is what turns an
 * incoherent environment into a rejected `NestFactory.create()`, before
 * Nest's own Logger exists. These tests exercise it directly, as a pure
 * function of a plain env object, so the boot-time wiring in
 * `server-config.module.spec.ts` only has to prove the wiring itself.
 */
describe('loadEnvironment', () => {
  it('yields the stub provider and every other default from an empty environment', () => {
    const environment = loadEnvironment({});

    expect(environment).toEqual({
      API_PORT: 3000,
      SWAGGER_UI_ENABLED: false,
      ASSISTANT_PROVIDER: 'stub',
      ASSISTANT_PROVIDER_KEY: undefined,
      ASSISTANT_MODEL: undefined,
    });
  });

  it('yields the stub provider when optional env vars are passed as empty strings from container/UI environments', () => {
    const environment = loadEnvironment({
      SWAGGER_UI_ENABLED: '',
      ASSISTANT_PROVIDER: '',
      ASSISTANT_PROVIDER_KEY: '',
      ASSISTANT_MODEL: '',
    });

    expect(environment).toEqual({
      API_PORT: 3000,
      SWAGGER_UI_ENABLED: false,
      ASSISTANT_PROVIDER: 'stub',
      ASSISTANT_PROVIDER_KEY: undefined,
      ASSISTANT_MODEL: undefined,
    });
  });

  it('yields the configured ASSISTANT_MODEL when present', () => {
    expect(
      loadEnvironment({ ASSISTANT_MODEL: 'gemini-3.6-flash' }).ASSISTANT_MODEL,
    ).toBe('gemini-3.6-flash');
  });

  it('coerces a numeric API_PORT string', () => {
    expect(loadEnvironment({ API_PORT: '8080' }).API_PORT).toBe(8080);
  });

  it('names API_PORT when it is present but not a valid port number', () => {
    expect(() => loadEnvironment({ API_PORT: 'not-a-number' })).toThrow(
      /API_PORT/,
    );
  });

  it('parses the SWAGGER_UI_ENABLED flag into a boolean', () => {
    expect(
      loadEnvironment({ SWAGGER_UI_ENABLED: 'true' }).SWAGGER_UI_ENABLED,
    ).toBe(true);
    expect(
      loadEnvironment({ SWAGGER_UI_ENABLED: 'false' }).SWAGGER_UI_ENABLED,
    ).toBe(false);
  });

  it('names SWAGGER_UI_ENABLED when it is present but not true or false', () => {
    expect(() => loadEnvironment({ SWAGGER_UI_ENABLED: 'yes' })).toThrow(
      /SWAGGER_UI_ENABLED/,
    );
  });

  it('names ASSISTANT_PROVIDER when it is present but not a provider this schema knows', () => {
    expect(() => loadEnvironment({ ASSISTANT_PROVIDER: 'bogus' })).toThrow(
      /ASSISTANT_PROVIDER/,
    );
  });

  it.each(['gemini', 'anthropic'] as const)(
    'names ASSISTANT_PROVIDER_KEY when the %s provider is chosen and the key is absent',
    (provider) => {
      expect(() => loadEnvironment({ ASSISTANT_PROVIDER: provider })).toThrow(
        /ASSISTANT_PROVIDER_KEY/,
      );
    },
  );

  it('names ASSISTANT_PROVIDER_KEY when it is present but empty', () => {
    expect(() =>
      loadEnvironment({
        ASSISTANT_PROVIDER: 'gemini',
        ASSISTANT_PROVIDER_KEY: '',
      }),
    ).toThrow(/ASSISTANT_PROVIDER_KEY/);
  });

  it.each(['gemini', 'anthropic'] as const)(
    'accepts the %s provider once its key is present — selecting an unshipped provider is a different failure, raised where the provider is actually selected',
    (provider) => {
      const environment = loadEnvironment({
        ASSISTANT_PROVIDER: provider,
        ASSISTANT_PROVIDER_KEY: 'sk-dummy-does-not-matter-here',
      });

      expect(environment.ASSISTANT_PROVIDER).toBe(provider);
      expect(environment.ASSISTANT_PROVIDER_KEY).toBe(
        'sk-dummy-does-not-matter-here',
      );
    },
  );

  it('stops the boot on an unknown variable matching the ASSISTANT_ prefix, naming it — the near-miss a mistyped key name would otherwise fall through as', () => {
    expect(() =>
      loadEnvironment({
        ASSISTANT_PROVIDER: 'gemini',
        ASSISTANT_PROVIDR_KEY: 'sk-typo',
      }),
    ).toThrow(/ASSISTANT_PROVIDR_KEY/);
  });

  it('never echoes the key value into its failure message', () => {
    try {
      loadEnvironment({
        ASSISTANT_PROVIDER: 'gemini',
        ASSISTANT_PROVIDR_KEY: 'sk-super-secret-value',
      });
      throw new Error('expected loadEnvironment to throw');
    } catch (error) {
      expect(String(error)).not.toContain('sk-super-secret-value');
    }
  });

  it('leaves unrelated environment variables alone — API_PORT sharing no prefix with an unrelated var is not a near-miss', () => {
    expect(() =>
      loadEnvironment({ PATH: '/usr/bin', HOME: '/root' }),
    ).not.toThrow();
  });
});
