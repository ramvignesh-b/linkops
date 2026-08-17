import {
  environmentSchema,
  environmentShapeSchema,
  type Environment,
} from './environment.schema';

/** Thrown by `loadEnvironment`; never carries a variable's value, only its name. */
export class EnvironmentValidationError extends Error {}

/**
 * The prefix a near-miss variable name is caught by. Scoped to the
 * Assistant's own two variables rather than all four: `PORT` and
 * `SWAGGER_UI_ENABLED` are common, standalone names with no sibling to be
 * typo'd against, so there is no near-miss failure mode for them to guard.
 */
const ASSISTANT_PREFIX = 'ASSISTANT_';

/**
 * Every full `ASSISTANT_`-prefixed env var name this schema recognises,
 * read off `environmentShapeSchema` itself rather than hand-maintained here
 * — a field added to or removed from the schema changes this set with no
 * second edit, so the near-miss check below can never drift from what the
 * schema actually reads.
 */
const KNOWN_ASSISTANT_VARIABLES = new Set(
  Object.keys(environmentShapeSchema.shape).filter((key) =>
    key.startsWith(ASSISTANT_PREFIX),
  ),
);

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
 * while `ASSISTANT_PROVIDER` selects a model provider, and an
 * `ASSISTANT_`-prefixed variable
 * this schema does not read at all.
 *
 * Called twice in practice, both throws landing the same way: once by
 * `main.ts`, directly and synchronously before Nest is ever touched, and
 * again inside `ServerConfigModule`'s `ENVIRONMENT` provider — a
 * `useFactory`, not `ConfigModule.forRoot`'s `validate` option, because a
 * `useFactory` runs at DI instantiation time (every `compile()`), where a
 * `@Module()` decorator's own arguments evaluate once, the first time the
 * module is imported, and never again. That second copy is what makes an
 * incoherent environment fail `Test.createTestingModule(...).compile()` too,
 * for any module built independently of `main.ts`.
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
