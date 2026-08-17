#!/usr/bin/env node
/**
 * Verifies the Console's true first-load payload against the budget
 * `apps/console/project.json` states, by measuring it — serving the real
 * production build and driving a real headless browser to `/`, then
 * summing the actual bytes every response carried.
 *
 * This replaced a static-file classification (main/polyfills/styles vs.
 * `chunk-*.js` vs. everything else) that looked reasonable and was wrong
 * twice in one sitting: it excluded Native Federation's shared-dependency
 * bundles entirely (they are not an initial `<script>` tag Angular's own
 * bundler emits, so a filename-based check never finds them, even though
 * every one of them is fetched before first render — see ADR-0014's
 * "Consequences"), and separately, it treated every `chunk-<hash>.js` file
 * as optional "on demand" weight — wrong for the specific chunk the `/`
 * route's redirect to `/links` pulls in on every single visit, which is
 * not on demand in any sense that matters. Guessing which chunk belongs to
 * the default route from a filename alone is not reliable; asking a real
 * browser what it actually downloaded is. That is what this does instead.
 *
 * Requires the Chromium binary Playwright drives: `npx playwright install
 * chromium`, once, wherever this runs (locally or in CI).
 */
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { chromium } from 'playwright-core';

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

const MIME_TYPES = {
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.map': 'application/json',
};

/**
 * A static file server with no compression and no caching headers — every
 * byte it sends is a byte on disk, so what a response body measures here is
 * the same raw-byte convention `apps/console/project.json`'s own `budgets`
 * already use. SPA-style fallback to `index.html`: this app resolves its
 * own routing client-side once `main.js` runs, so any path this server
 * doesn't recognise as a real file is the app shell, not a 404.
 */
function serveStatic(root) {
  return createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);

    // apps/api isn't running for this measurement — a deliberate scoping
    // choice, not an oversight. This tool measures the Console's own asset
    // payload; live API responses (a roster of ten Links, a Summary) are a
    // few kB against ~1 MB of framework and app code, and answering them
    // with the SPA's index.html fallback instead of a 404 would silently
    // inflate the total with fallback-page noise wearing an API response's
    // name.
    if (urlPath.startsWith('/api/')) {
      res.writeHead(404);
      res.end();
      return;
    }

    const safePath = normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
    let filePath = join(root, safePath);

    try {
      if (statSync(filePath).isDirectory()) {
        filePath = join(filePath, 'index.html');
      }
    } catch {
      filePath = join(root, 'index.html');
    }

    if (!filePath.startsWith(root + sep) && filePath !== root) {
      res.writeHead(403);
      res.end();
      return;
    }

    try {
      const body = readFileSync(filePath);
      res.writeHead(200, {
        'content-type':
          MIME_TYPES[extname(filePath)] ?? 'application/octet-stream',
      });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

const server = serveStatic(distDir);
const port = await listen(server);
const origin = `http://127.0.0.1:${port}`;

let browser;
const bytesByUrl = new Map();

try {
  browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();

  page.on('response', async (response) => {
    if (!response.url().startsWith(origin)) return;
    try {
      bytesByUrl.set(response.url(), (await response.body()).length);
    } catch {
      // No body to measure (e.g. a redirect) — nothing to add.
    }
  });

  await page.goto(origin + '/', { waitUntil: 'networkidle' });
  // The Fleet route is what `/` redirects to — its table is the signal
  // that everything this visit actually needed has arrived.
  await page.waitForSelector('table', { timeout: 15000 });
} finally {
  await browser?.close();
  server.close();
}

const entries = [...bytesByUrl.entries()].map(([url, bytes]) => ({
  file: url.slice(origin.length + 1) || 'index.html',
  bytes,
}));
const totalBytes = entries.reduce((total, entry) => total + entry.bytes, 0);

const status =
  totalBytes > errorKb * 1000
    ? 'error'
    : totalBytes > warnKb * 1000
      ? 'warn'
      : 'pass';

if (jsonMode) {
  console.log(JSON.stringify({ warnKb, errorKb, entries, totalBytes, status }));
} else {
  const kb = (bytes) => (bytes / 1000).toFixed(2);
  const sorted = [...entries].sort((a, b) => b.bytes - a.bytes);

  for (const entry of sorted) {
    console.log(`${kb(entry.bytes).padStart(10)} kB  ${entry.file}`);
  }
  console.log();
  console.log(
    `Real first-load total:   ${kb(totalBytes)} kB (${entries.length} requests)`,
  );
  console.log();

  if (status === 'error') {
    console.error(
      `✖ ${kb(totalBytes)} kB exceeds the ${errorKb} kB error budget.`,
    );
  } else if (status === 'warn') {
    console.warn(
      `⚠ ${kb(totalBytes)} kB exceeds the ${warnKb} kB warn budget.`,
    );
  } else {
    console.log(`✔ within the ${warnKb} kB warn budget.`);
  }
}

if (status === 'error') {
  process.exitCode = 1;
}
