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
      PORT: 3000,
      SWAGGER_UI_ENABLED: false,
      ASSISTANT_PROVIDER: 'stub',
      ASSISTANT_PROVIDER_KEY: undefined,
    });
  });

  it('coerces a numeric PORT string', () => {
    expect(loadEnvironment({ PORT: '8080' }).PORT).toBe(8080);
  });

  it('names PORT when it is present but not a valid port number', () => {
    expect(() => loadEnvironment({ PORT: 'not-a-number' })).toThrow(/PORT/);
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

  it('names ASSISTANT_PROVIDER_KEY when the model provider is chosen and the key is absent', () => {
    expect(() => loadEnvironment({ ASSISTANT_PROVIDER: 'model' })).toThrow(
      /ASSISTANT_PROVIDER_KEY/,
    );
  });

  it('names ASSISTANT_PROVIDER_KEY when it is present but empty', () => {
    expect(() =>
      loadEnvironment({
        ASSISTANT_PROVIDER: 'model',
        ASSISTANT_PROVIDER_KEY: '',
      }),
    ).toThrow(/ASSISTANT_PROVIDER_KEY/);
  });

  it('accepts the model provider once its key is present — selecting an unshipped provider is a different failure, raised where the provider is actually selected', () => {
    const environment = loadEnvironment({
      ASSISTANT_PROVIDER: 'model',
      ASSISTANT_PROVIDER_KEY: 'sk-dummy-does-not-matter-here',
    });

    expect(environment.ASSISTANT_PROVIDER).toBe('model');
    expect(environment.ASSISTANT_PROVIDER_KEY).toBe(
      'sk-dummy-does-not-matter-here',
    );
  });

  it('stops the boot on an unknown variable matching the ASSISTANT_ prefix, naming it — the near-miss a mistyped key name would otherwise fall through as', () => {
    expect(() =>
      loadEnvironment({
        ASSISTANT_PROVIDER: 'model',
        ASSISTANT_PROVIDR_KEY: 'sk-typo',
      }),
    ).toThrow(/ASSISTANT_PROVIDR_KEY/);
  });

  it('never echoes the key value into its failure message', () => {
    try {
      loadEnvironment({
        ASSISTANT_PROVIDER: 'model',
        ASSISTANT_PROVIDR_KEY: 'sk-super-secret-value',
      });
      throw new Error('expected loadEnvironment to throw');
    } catch (error) {
      expect(String(error)).not.toContain('sk-super-secret-value');
    }
  });

  it('leaves unrelated environment variables alone — PORT sharing no prefix with an unrelated var is not a near-miss', () => {
    expect(() =>
      loadEnvironment({ PATH: '/usr/bin', HOME: '/root' }),
    ).not.toThrow();
  });
});
