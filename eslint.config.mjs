import nx from '@nx/eslint-plugin';

const TS_FILES = ['**/*.ts', '**/*.tsx', '**/*.cts', '**/*.mts'];
const ALL_SOURCE = [...TS_FILES, '**/*.js', '**/*.jsx', '**/*.cjs', '**/*.mjs'];

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: ['**/dist', '**/out-tsc', '**/vitest.config.*.timestamp*'],
  },
  {
    files: ALL_SOURCE,
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            // Platform — the server/console firewall, and the only boundary
            // here that is architectural rather than organisational.
            {
              sourceTag: 'platform:shared',
              onlyDependOnLibsWithTags: ['platform:shared'],
            },
            {
              sourceTag: 'platform:server',
              onlyDependOnLibsWithTags: ['platform:server', 'platform:shared'],
            },
            {
              sourceTag: 'platform:console',
              onlyDependOnLibsWithTags: ['platform:console', 'platform:shared'],
            },

            // Type — layers point one way: feature to data-access to domain,
            // and feature to ui to domain. Never back up the chain, and never
            // feature to feature.
            {
              sourceTag: 'type:app',
              onlyDependOnLibsWithTags: [
                'type:feature',
                'type:data-access',
                'type:ui',
                'type:domain',
              ],
            },
            {
              sourceTag: 'type:feature',
              onlyDependOnLibsWithTags: [
                'type:data-access',
                'type:ui',
                'type:domain',
              ],
            },
            {
              sourceTag: 'type:data-access',
              onlyDependOnLibsWithTags: ['type:data-access', 'type:domain'],
            },
            {
              sourceTag: 'type:ui',
              onlyDependOnLibsWithTags: ['type:ui', 'type:domain'],
            },
            {
              sourceTag: 'type:domain',
              onlyDependOnLibsWithTags: ['type:domain'],
              // The domain layer stays framework-free. zod is deliberately
              // absent from this list: it is the shared contract itself.
              bannedExternalImports: ['@nestjs/*', '@angular/*', 'rxjs'],
            },
          ],
        },
      ],
    },
  },
  {
    files: TS_FILES,
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      // 'no-public' rather than 'explicit': requiring the public keyword on
      // every member adds a word that carries no information.
      '@typescript-eslint/explicit-member-accessibility': [
        'error',
        { accessibility: 'no-public' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ALL_SOURCE,
    rules: {
      // Warnings by design — CI runs with --max-warnings 0, so these fail the
      // build without blocking a work-in-progress edit locally.
      complexity: ['warn', 10],
      'max-lines-per-function': [
        'warn',
        { max: 50, skipBlankLines: true, skipComments: true },
      ],
      // The API logs through Nest's Logger. warn and error stay available for
      // the config module's fail-fast path, which runs before that Logger does.
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    // A describe block is a function to this rule but not to a reader.
    files: ['**/*.spec.ts', '**/*.test.ts'],
    rules: {
      'max-lines-per-function': 'off',
    },
  },
  {
    // Nest resolves constructor dependencies from the design:paramtypes
    // metadata the compiler emits, and a type-only import erases the reference
    // that metadata is built from. Autofixing an injected dependency to
    // `import { type Foo }` still compiles and still builds — it fails at boot
    // with "Nest can't resolve dependencies", which is the worst place to find
    // out. The rule buys bundle hygiene, and the server has no bundle budget,
    // so it is simply off here.
    //
    // It stays on for the Console, where bundle size is real. That is safe
    // while dependencies are obtained with inject(); an Angular class using
    // constructor injection would hit exactly the same erasure.
    files: ['apps/api/**/*.ts', 'libs/server/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
  {
    // A CLI script, not application code: printing to stdout is its actual
    // job (a human's terminal, or CI piping JSON through `jq`), not a
    // stray debug log the `warn`/`error`-only rule above exists to catch.
    files: ['tools/**/*.mjs'],
    rules: {
      'no-console': 'off',
    },
  },
];
