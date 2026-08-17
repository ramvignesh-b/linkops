import { environmentSchema, type Environment } from './environment.schema';

/** Thrown by `loadEnvironment`; never carries a variable's value, only its name. */
export class EnvironmentValidationError extends Error {}

/**
 * Every full env var name this schema recognises. Used only to build the
 * near-miss check below — the schema itself never needs this list, because
 * a zod object silently ignores keys it wasn't told about.
 */
const KNOWN_ASSISTANT_VARIABLES = new Set([
  'ASSISTANT_PROVIDER',
  'ASSISTANT_PROVIDER_KEY',
]);

/**
 * The prefix a near-miss variable name is caught by. Scoped to the
 * Assistant's own two variables rather than all four: `PORT` and
 * `SWAGGER_UI_ENABLED` are common, standalone names with no sibling to be
 * typo'd against, so there is no near-miss failure mode for them to guard.
 */
const ASSISTANT_PREFIX = 'ASSISTANT_';

/**
 * A var that looks like it means to configure the Assistant but names
 * nothing this schema reads — the mistyped key that would otherwise leave
 * someone on the stub while believing they had configured a model.
 */
function unknownAssistantVariables(env: Record<string, unknown>): string[] {
  return Object.keys(env).filter(
    (key) =>
      key.startsWith(ASSISTANT_PREFIX) && !KNOWN_ASSISTANT_VARIABLES.has(key),
  );
}

function describeIssues(
  issues: readonly { path: PropertyKey[]; message: string }[],
): string {
  return issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
}

/**
 * Validates coherence, not presence, over the raw environment: every
 * variable is individually optional, so an empty environment is always
 * coherent and the application starts on the stub. Three things are
 * incoherent, each named in the thrown error rather than left to a stack
 * trace: a variable present but invalid, `ASSISTANT_PROVIDER_KEY` missing
 * while `ASSISTANT_PROVIDER=model`, and an `ASSISTANT_`-prefixed variable
 * this schema does not read at all.
 *
 * Matches the shape `ConfigModule.forRoot({ validate })` expects — see
 * `ServerConfigModule` — so throwing here is what turns an incoherent
 * environment into a rejected `NestFactory.create()`.
 */
export function loadEnvironment(
  rawEnv: Record<string, unknown> = process.env,
): Environment {
  const unknown = unknownAssistantVariables(rawEnv);
  if (unknown.length > 0) {
    throw new EnvironmentValidationError(
      `Unknown environment variable(s) matching the "${ASSISTANT_PREFIX}" prefix: ${unknown.join(', ')}. Check for a typo in the variable name — an unrecognised one is silently never read.`,
    );
  }

  const result = environmentSchema.safeParse(rawEnv);
  if (!result.success) {
    throw new EnvironmentValidationError(
      `Invalid environment configuration — ${describeIssues(result.error.issues)}`,
    );
  }

  return result.data;
}
