import { z } from 'zod';

/** `GET /api/links/:id/telemetry`'s default window when none is given. */
export const DEFAULT_TELEMETRY_WINDOW = '5m';

const WINDOW_PATTERN = /^(\d+)(s|m|h)$/;

const UNIT_MS: Record<string, number> = {
  s: 1_000,
  m: 60 * 1_000,
  h: 60 * 60 * 1_000,
};

/**
 * `GET /api/links/:id/telemetry`'s query string. `window` is a duration —
 * a positive integer followed by `s`, `m` or `h` — resolved to `windowMs`
 * here so the controller never parses a duration string itself.
 */
export const telemetryWindowQuerySchema = z
  .object({
    window: z.string().default(DEFAULT_TELEMETRY_WINDOW),
  })
  .transform((value, ctx) => {
    const match = WINDOW_PATTERN.exec(value.window);

    if (match === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['window'],
        message: `window must be a number followed by s, m or h, e.g. "5m" (got "${value.window}")`,
      });

      return z.NEVER;
    }

    const [, amount, unit] = match;

    return { windowMs: Number(amount) * UNIT_MS[unit] };
  });

export type TelemetryWindowQuery = z.infer<typeof telemetryWindowQuerySchema>;
