import { z } from 'zod';

/**
 * The two non-stub providers this repository's schema knows the *name* of.
 * Choosing either is coherent — the key becomes required — but no client for
 * them ships here; selecting one is a boot failure raised where the
 * Assistant module actually builds a provider, not by this schema. See
 * `selectA2uiAgent` in `@linkops/server/a2ui-agent`.
 */
export const assistantProviderSchema = z.enum(['stub', 'gemini', 'anthropic']);

export type AssistantProvider = z.infer<typeof assistantProviderSchema>;

/** The default model used when ASSISTANT_PROVIDER=gemini and ASSISTANT_MODEL is unset. */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';

/**
 * A string env var carrying exactly `"true"` or `"false"`, defaulting off,
 * transformed to a real boolean. `z.coerce.boolean()` was rejected here on
 * purpose — every non-empty string, including `"false"`, coerces to `true`
 * under it, which would make `SWAGGER_UI_ENABLED=false` turn the explorer
 * *on*.
 */
const booleanFlagSchema = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

/**
 * The four variables this application's boot is coherent or incoherent
 * over, before the cross-field coherence rule below is layered on. Exported
 * on its own — rather than only as `environmentSchema`'s hidden inner
 * schema — so `loadEnvironment`'s near-miss check can read
 * `environmentShapeSchema.shape` for the variable names this schema
 * actually knows, instead of hand-maintaining a second list that could
 * drift from this one.
 */
export const environmentShapeSchema = z.object({
  API_PORT: z.coerce.number().int().positive().default(3000),
  SWAGGER_UI_ENABLED: booleanFlagSchema,
  ASSISTANT_PROVIDER: assistantProviderSchema.default('stub'),
  ASSISTANT_PROVIDER_KEY: z.string().min(1).optional(),
  ASSISTANT_MODEL: z.string().min(1).optional(),
});

/**
 * Every one of the four variables above is optional by presence — a fully
 * empty environment parses — because "fail fast, naming what's wrong" and
 * "start with no credentials" can only both hold if the schema validates
 * coherence, not presence. `ASSISTANT_PROVIDER_KEY`'s conditional
 * requirement, enforced below, is where that coherence actually lives.
 */
export const environmentSchema = environmentShapeSchema.superRefine(
  (value, ctx) => {
    if (value.ASSISTANT_PROVIDER !== 'stub' && !value.ASSISTANT_PROVIDER_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['ASSISTANT_PROVIDER_KEY'],
        message: `ASSISTANT_PROVIDER_KEY is required when ASSISTANT_PROVIDER=${value.ASSISTANT_PROVIDER}`,
      });
    }
  },
);

export type Environment = z.infer<typeof environmentSchema>;
