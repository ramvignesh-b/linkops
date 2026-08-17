#!/usr/bin/env node
/**
 * Verifies the Console's first-load payload against the budget
 * `apps/console/project.json` states, by measuring it — serving the real
 * production build (gzip-compressed, matching how a real static host would
 * answer a compressing browser) and driving a real headless browser to
 * `/`, then summing what every response actually carried.
 *
 * Two totals, not one, because they mean different things:
 *
 * - **App code** — `main.js`, `polyfills.js`, `styles.css`, and this app's
 *   own `chunk-<hash>.js` route chunks. What this app's own code changes
 *   can actually move. Gated against `warnKb`/`errorKb` on **raw** bytes —
 *   the same convention Angular's own `esbuild` budget already checks, so
 *   this doesn't quietly redefine what that number means.
 * - **Shared infrastructure** — Native Federation's shared-dependency
 *   bundles (`_angular_core.<hash>.js`, `zod.<hash>.js`, the two
 *   `sharedMappings` libraries, ...). Confirmed against
 *   `@softarc/native-federation`'s own bundler (`bundle-shared.js`): every
 *   one of these is a package's own entry point, bundled by a separate
 *   step Angular's budget check never sees. Reported, not gated: it is a
 *   one-time, content-hashed, cacheable cost this app pays once per
 *   browser, not per visit, and not one a Console feature change can
 *   shrink by itself — see ADR-0014.
 *
 * Both raw (on disk) and gzip (actually on the wire, for a browser that
 * sends `Accept-Encoding: gzip`, which every real one does) are measured
 * and reported for both buckets — raw because that is the budget's own
 * unit, gzip because it is what a real deployment most likely transfers.
 *
 * A `chunk-<hash>.js` file being "app code" is a filename fact confirmed
 * against the bundler's own naming, not a guess about whether a browser
 * fetches it eagerly — which files actually get downloaded still comes
 * from asking a real browser, never from assuming a chunk is optional
 * because of its name. A prior version of this script did assume that,
 * and was wrong about the one route the app redirects to by default. See
 * git history and ADR-0014's "Consequences" for the full account of what
 * was tried and ruled out before landing here.
 *
 * Requires the Chromium binary Playwright drives: `npx playwright install
 * chromium`, once, wherever this runs (locally or in CI).
 */
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
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

// Compressing these again wins nothing (woff2 is already compressed) or
// isn't worth the CPU for how rarely a browser asks — matches a
// conventional static host's own compressible-types list.
const COMPRESSIBLE_EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.css',
  '.html',
  '.json',
  '.svg',
]);

/**
 * Populated by the server as it serves each file — the one authoritative
 * source for a file's raw (on disk) and transfer (on the wire) byte counts,
 * since the server is the one place both are known without re-deriving one
 * from the other.
 */
const sizesByPath = new Map();

/**
 * Resolves a request path to a file under `root`, SPA-style: this app
 * resolves its own routing client-side once `main.js` runs, so a directory
 * or an unrecognised path falls back to `index.html`, the app shell,
 * rather than a 404. Returns `null` for a path that would escape `root`.
 */
function resolveFilePath(root, urlPath) {
  const safePath = normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  let filePath = join(root, safePath);

  try {
    if (statSync(filePath).isDirectory()) {
      filePath = join(filePath, 'index.html');
    }
  } catch {
    filePath = join(root, 'index.html');
  }

  return filePath.startsWith(root + sep) || filePath === root ? filePath : null;
}

/**
 * Reads a file and gzips it when the request accepts gzip and the type is
 * worth compressing — every real browser, headless Chromium included,
 * sends `Accept-Encoding: gzip` by default, so this is what actually
 * crosses the wire for a real compressing static host, not the
 * uncompressed file on disk.
 */
function readForResponse(filePath, acceptEncodingHeader) {
  const rawBody = readFileSync(filePath);
  const acceptsGzip = (acceptEncodingHeader ?? '').includes('gzip');
  const shouldGzip =
    acceptsGzip && COMPRESSIBLE_EXTENSIONS.has(extname(filePath));
  const body = shouldGzip ? gzipSync(rawBody) : rawBody;
  const headers = {
    'content-type': MIME_TYPES[extname(filePath)] ?? 'application/octet-stream',
    ...(shouldGzip && { 'content-encoding': 'gzip' }),
  };

  return {
    body,
    headers,
    rawBytes: rawBody.length,
    transferBytes: body.length,
  };
}

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

    const filePath = resolveFilePath(root, urlPath);
    if (!filePath) {
      res.writeHead(403);
      res.end();
      return;
    }

    try {
      const { body, headers, rawBytes, transferBytes } = readForResponse(
        filePath,
        req.headers['accept-encoding'],
      );
      sizesByPath.set(urlPath === '/' ? '/index.html' : urlPath, {
        rawBytes,
        transferBytes,
      });
      res.writeHead(200, headers);
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

const isAppCode = (file) =>
  file === 'index.html' ||
  /^main[.-]/.test(file) ||
  /^polyfills[.-]/.test(file) ||
  /^styles[.-].*\.css$/.test(file) ||
  /^chunk-[A-Za-z0-9]+\.js$/.test(file);
const isSharedInfra = (file) => file.endsWith('.js') && !isAppCode(file);
const bucketOf = (file) =>
  isAppCode(file) ? 'app' : isSharedInfra(file) ? 'shared' : 'asset';

const server = serveStatic(distDir);
const port = await listen(server);
const origin = `http://127.0.0.1:${port}`;

const fetchedPaths = new Set();
let browser;

try {
  browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();

  page.on('response', (response) => {
    if (!response.url().startsWith(origin)) return;
    const urlPath = new URL(response.url()).pathname;
    fetchedPaths.add(urlPath === '/' ? '/index.html' : urlPath);
  });

  await page.goto(origin + '/', { waitUntil: 'networkidle' });
  // The Fleet route is what `/` redirects to — its table is the signal
  // that everything this visit actually needed has arrived.
  await page.waitForSelector('table', { timeout: 15000 });
} finally {
  await browser?.close();
  server.close();
}

const entries = [...fetchedPaths]
  .filter((urlPath) => sizesByPath.has(urlPath))
  .map((urlPath) => {
    const file = urlPath.replace(/^\//, '');
    const { rawBytes, transferBytes } = sizesByPath.get(urlPath);
    return { file, rawBytes, transferBytes, bucket: bucketOf(file) };
  });

const sumBucket = (bucket, key) =>
  entries
    .filter((e) => e.bucket === bucket)
    .reduce((total, e) => total + e[key], 0);

const appRawBytes = sumBucket('app', 'rawBytes');
const appTransferBytes = sumBucket('app', 'transferBytes');
const sharedRawBytes = sumBucket('shared', 'rawBytes');
const sharedTransferBytes = sumBucket('shared', 'transferBytes');
const assetRawBytes = sumBucket('asset', 'rawBytes');
const assetTransferBytes = sumBucket('asset', 'transferBytes');
const totalRawBytes = appRawBytes + sharedRawBytes + assetRawBytes;
const totalTransferBytes =
  appTransferBytes + sharedTransferBytes + assetTransferBytes;

// Only app code is gated, on raw bytes — the budget's own unit. See the
// header comment for why shared infrastructure is reported, not budgeted.
const status =
  appRawBytes > errorKb * 1000
    ? 'error'
    : appRawBytes > warnKb * 1000
      ? 'warn'
      : 'pass';

if (jsonMode) {
  console.log(
    JSON.stringify({
      warnKb,
      errorKb,
      entries,
      appRawBytes,
      appTransferBytes,
      sharedRawBytes,
      sharedTransferBytes,
      assetRawBytes,
      assetTransferBytes,
      totalRawBytes,
      totalTransferBytes,
      status,
    }),
  );
} else {
  const kb = (bytes) => (bytes / 1000).toFixed(2);
  const printBucket = (label, bucket) => {
    console.log(`${label}:`);
    for (const e of [...entries]
      .filter((x) => x.bucket === bucket)
      .sort((a, b) => b.rawBytes - a.rawBytes)) {
      console.log(
        `  ${kb(e.rawBytes).padStart(10)} kB raw / ${kb(e.transferBytes).padStart(10)} kB gzip  ${e.file}`,
      );
    }
  };

  printBucket('App code (gated)', 'app');
  printBucket(
    'Shared infrastructure (reported, not gated — one-time, cacheable)',
    'shared',
  );
  printBucket('Other assets (fonts, manifests)', 'asset');
  console.log();
  console.log(
    `App code:              ${kb(appRawBytes)} kB raw / ${kb(appTransferBytes)} kB gzip  (budget: ${warnKb}/${errorKb} kB raw)`,
  );
  console.log(
    `Shared infrastructure:  ${kb(sharedRawBytes)} kB raw / ${kb(sharedTransferBytes)} kB gzip  (informational)`,
  );
  console.log(
    `Total first-load:       ${kb(totalRawBytes)} kB raw / ${kb(totalTransferBytes)} kB gzip`,
  );
  console.log();

  if (status === 'error') {
    console.error(
      `✖ App code ${kb(appRawBytes)} kB raw exceeds the ${errorKb} kB error budget.`,
    );
  } else if (status === 'warn') {
    console.warn(
      `⚠ App code ${kb(appRawBytes)} kB raw exceeds the ${warnKb} kB warn budget.`,
    );
  } else {
    console.log(`✔ App code within the ${warnKb} kB warn budget.`);
  }
}

if (status === 'error') {
  process.exitCode = 1;
}
