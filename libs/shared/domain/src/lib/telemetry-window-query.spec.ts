import { telemetryWindowQuerySchema } from './telemetry-window-query';

describe('telemetryWindowQuerySchema', () => {
  it('defaults to a 5-minute window when window is absent', () => {
    const parsed = telemetryWindowQuerySchema.parse({});

    expect(parsed).toEqual({ windowMs: 5 * 60 * 1000 });
  });

  it('parses a seconds window', () => {
    const parsed = telemetryWindowQuerySchema.parse({ window: '30s' });

    expect(parsed).toEqual({ windowMs: 30 * 1000 });
  });

  it('parses a minutes window', () => {
    const parsed = telemetryWindowQuerySchema.parse({ window: '5m' });

    expect(parsed).toEqual({ windowMs: 5 * 60 * 1000 });
  });

  it('parses an hours window', () => {
    const parsed = telemetryWindowQuerySchema.parse({ window: '1h' });

    expect(parsed).toEqual({ windowMs: 60 * 60 * 1000 });
  });

  it.each(['5', '5x', '-5m', 'm5', '', '5.5m'])(
    'rejects an unparseable window of %s',
    (window) => {
      const result = telemetryWindowQuerySchema.safeParse({ window });

      expect(result.success).toBe(false);
    },
  );

  it('names window as the offending field on rejection', () => {
    const result = telemetryWindowQuerySchema.safeParse({ window: 'bogus' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['window']);
    }
  });
});
