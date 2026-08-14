import { defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

// No decorator transform plugin here on purpose. Vite 8 transforms through
// rolldown/oxc, which implements emitDecoratorMetadata, so the flag in
// tsconfig.base.json is enough for Nest to resolve DI by type. See ADR-0002.
export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../../node_modules/.vite/libs/server/health',
  plugins: [nxViteTsPaths()],
  test: {
    name: 'server-health',
    watch: false,
    // These projects are stubs until their implementation lands; an empty
    // suite should not fail the run.
    passWithNoTests: true,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../coverage/libs/server/health',
      provider: 'v8' as const,
    },
  },
}));
