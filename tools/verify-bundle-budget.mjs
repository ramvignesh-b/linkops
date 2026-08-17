#!/usr/bin/env node
/**
 * Verifies the *true* first-load payload of a Native Federation host's
 * production build, against the same budget its `project.json` states.
 *
 * `@angular/build:application`'s own budget check only sees what its own
 * bundler emits as an initial `<script>`/`<link>` tag — `main.js`,
 * `polyfills.js`, `styles.css`. It has no visibility into the shared-
 * dependency bundles Native Federation builds and serves separately
 * (`_angular_core.<hash>.js`, `zod.<hash>.js`,
 * `_linkops_console_data_access-<hash>.js`, ...), even though every one of
 * them is required to bootstrap the app and is fetched before first render
 * regardless — confirmed against a real browser session, not assumed. See
 * ADR-0014's "Consequences" for the measurement this caught.
 *
 * Three buckets, by filename:
 * - `main*.js` / `polyfills*.js` / `styles*.css` — Angular's own "initial",
 *   the only thing the built-in budget checker counts.
 * - `chunk-<hash>.js` — genuine lazy route chunks. Correctly excluded: these
 *   really are fetched on demand, not at boot.
 * - everything else — Native Federation's shared-dependency bundles. Not a
 *   lazy chunk's naming shape, not Angular's own initial output, but part of
 *   the true first-load total this script exists to compute.
 *
 * `--json` prints one structured line to stdout instead of the human-
 * readable report — what the CI bundle-report step reads, so both the gate
 * and the PR comment read the one classification, rather than each
 * re-deriving it and risking drifting apart the way the bundle-report step
 * that predates this file did.
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const [distDir, warnKbArg, errorKbArg] = args.filter((arg) => arg !== '--json');

if (!distDir) {
  console.error(
    'usage: verify-bundle-budget.mjs <dist-browser-dir> [warnKb=650] [errorKb=1000] [--json]',
  );
  process.exit(2);
}

const warnKb = Number(warnKbArg ?? 650);
const errorKb = Number(errorKbArg ?? 1000);

const isInitial = (file) =>
  /^main[.-]/.test(file) ||
  /^polyfills[.-]/.test(file) ||
  /^styles[.-].*\.css$/.test(file);
const isLazyRouteChunk = (file) => /^chunk-[A-Za-z0-9]+\.js$/.test(file);

const files = readdirSync(distDir).filter(
  (file) => file.endsWith('.js') || file.endsWith('.css'),
);

const initial = [];
const shared = [];
const lazy = [];

for (const file of files) {
  const bytes = statSync(join(distDir, file)).size;
  const entry = { file, bytes };
  if (isInitial(file)) {
    initial.push(entry);
  } else if (isLazyRouteChunk(file)) {
    lazy.push(entry);
  } else {
    shared.push(entry);
  }
}

const sum = (entries) =>
  entries.reduce((total, entry) => total + entry.bytes, 0);
const initialBytes = sum(initial);
const sharedBytes = sum(shared);
const lazyBytes = sum(lazy);
const trueInitialBytes = initialBytes + sharedBytes;

const status =
  trueInitialBytes > errorKb * 1000
    ? 'error'
    : trueInitialBytes > warnKb * 1000
      ? 'warn'
      : 'pass';

if (jsonMode) {
  console.log(
    JSON.stringify({
      warnKb,
      errorKb,
      initial,
      shared,
      lazy,
      initialBytes,
      sharedBytes,
      lazyBytes,
      trueInitialBytes,
      status,
    }),
  );
} else {
  const kb = (bytes) => (bytes / 1000).toFixed(2);

  console.log(`Angular-tracked initial:   ${kb(initialBytes)} kB`);
  console.log(
    `Federation shared deps:    ${kb(sharedBytes)} kB (${shared.length} files — fetched before first render, invisible to Angular's own budget check)`,
  );
  console.log(
    `Lazy route chunks:         ${kb(lazyBytes)} kB (on demand — correctly excluded)`,
  );
  console.log(`TRUE first-load total:     ${kb(trueInitialBytes)} kB`);
  console.log();

  if (status === 'error') {
    console.error(
      `✖ ${kb(trueInitialBytes)} kB exceeds the ${errorKb} kB error budget.`,
    );
  } else if (status === 'warn') {
    console.warn(
      `⚠ ${kb(trueInitialBytes)} kB exceeds the ${warnKb} kB warn budget.`,
    );
  } else {
    console.log(`✔ within the ${warnKb} kB warn budget.`);
  }
}

if (status === 'error') {
  process.exitCode = 1;
}
