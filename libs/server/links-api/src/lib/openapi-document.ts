import { Logger, type INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
} from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';

/**
 * Where the explorer is mounted, relative to the global `api` prefix's own
 * root. Kept as a constant for the server-side reader; the browser-side
 * interceptor in `mountApiExplorer` has to inline the same literal, for the
 * reason documented there.
 */
const EXPLORER_MOUNT = 'api';

const logger = new Logger('OpenApi');

/**
 * Assembles the OpenAPI document from the app's own controllers and DTOs —
 * the same `createZodDto`-generated classes the endpoints validate with, so
 * this document cannot describe an API that does not exist. See ADR-0006.
 *
 * Only the document is built here. Nothing calls `SwaggerModule.setup()` —
 * that is `mountApiExplorer`, below, and it is the caller's choice whether
 * to call it at all.
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('LinkOps API')
    .setDescription(
      "LinkOps Console's REST surface for the Fleet of Links. Every request and response shape here is generated from the shared zod schemas the server validates with (ADR-0006), including the error envelope: `message` is diagnostic — for logs and API consumers, never for an operator.",
    )
    .setVersion('1.0')
    .build();

  return cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));
}

/**
 * Reads the public path prefix this API is mounted under from
 * `X-Forwarded-Prefix`, the conventional header a reverse proxy sets when it
 * serves an upstream from a subpath.
 *
 * The document's own paths are written from the API's root (`/links`,
 * `/fleet/summary`), so a Client that reaches the server at
 * `https://host/linkops/api/...` cannot resolve them without being told about
 * `/linkops`. The Server has no way to discover that on its own: from inside
 * the container the request arrives as `/api/...` with the prefix already
 * stripped. Only the proxy knows, so only the proxy can say.
 *
 * Deliberately the *only* signal consulted. An earlier version fell back to
 * parsing `Referer`, which was wrong twice over: it yields the explorer's own
 * path (`/linkops/api`) rather than the mount prefix (`/linkops`), doubling
 * the `/api` segment; and it makes a published contract vary by whichever page
 * happened to request it. When the header is absent the document simply
 * carries no `servers` entry, which is honest — the Server genuinely does not
 * know. The explorer stays usable regardless, via the browser-side
 * interceptor in `mountApiExplorer`.
 */
export function resolveForwardedPrefix(
  headers: Record<string, string | string[] | undefined> | undefined,
): string | undefined {
  const raw = headers?.['x-forwarded-prefix'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim().replace(/\/+$/, '');
  if (trimmed === '') {
    return undefined;
  }

  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

/**
 * Returns the document with a `servers` entry naming `prefix`, or the document
 * untouched when there is no prefix to declare. Never mutates the original —
 * one document object is built at boot and shared across every request.
 */
export function withBasePath(
  document: OpenAPIObject,
  prefix: string | undefined,
): OpenAPIObject {
  return prefix ? { ...document, servers: [{ url: prefix }] } : document;
}

/**
 * Mounts the interactive Swagger explorer at `GET /api`, over a document
 * `buildOpenApiDocument` already built. Split out from that function so
 * `main.ts` can gate the call behind `SWAGGER_UI_ENABLED` — an
 * unauthenticated, `DELETE`-capable explorer is a different proposition on
 * a host managing live radio infrastructure than on a developer's laptop —
 * while `GET /api/openapi.json` stays served unconditionally either way.
 *
 * Call this before `app.init()` / `app.listen()`, never after. `init()` is
 * what registers Nest's own catch-all "not found" handler as the terminal
 * Express middleware; a route added afterwards is present in the router's
 * stack but never reached, because that handler always answers first.
 */
export function mountApiExplorer(
  app: INestApplication,
  document: OpenAPIObject,
): void {
  const patchDocumentOnRequest = (
    req: unknown,
    res: unknown,
    doc: OpenAPIObject,
  ): OpenAPIObject => {
    // `swagger-ui-init.js` is generated per request — it carries the document,
    // and its `servers` entry depends on headers this very hook reads. Its
    // name ends in `.js`, though, so every layer that classifies cacheability
    // by file extension (Cloudflare's default static rules, an `expires 1y`
    // nginx block, the browser itself) will happily treat it as immutable and
    // stop asking the origin. The symptom is indistinguishable from the hook
    // being broken: a stale document served forever, and no request ever
    // reaching this line to say so. Same reasoning as the no-store rule the
    // Console's nginx applies to `remoteEntry.json`.
    (res as { setHeader?: (name: string, value: string) => void })?.setHeader?.(
      'Cache-Control',
      'no-store, no-cache, must-revalidate',
    );

    const headers = (
      req as { headers?: Record<string, string | string[] | undefined> }
    )?.headers;
    const prefix = resolveForwardedPrefix(headers);

    // One line per explorer load, and the only place that proves this hook is
    // wired at all. Its absence from the logs is itself the diagnosis: it
    // means @nestjs/swagger never called us, which is exactly the failure the
    // dual-position option below exists to prevent. Named headers only — a
    // full dump puts `authorization` and `cookie` in the log.
    logger.log(
      `explorer document: host=${String(headers?.['host'] ?? '?')} ` +
        `x-forwarded-prefix=${String(headers?.['x-forwarded-prefix'] ?? '(unset)')} ` +
        `-> servers=${prefix ?? '(none; browser fallback applies)'}`,
    );

    return withBasePath(doc, prefix);
  };

  SwaggerModule.setup(EXPLORER_MOUNT, app, document, {
    // Passed in BOTH positions on purpose. `SwaggerCustomOptions` declares
    // `patchDocumentOnRequest` at the top level, but every read site in
    // @nestjs/swagger 11.4.6's implementation looks for it at
    // `options.swaggerOptions.patchDocumentOnRequest` — see `serveSwaggerUi`
    // and `serveDefinitions` in `dist/swagger-module.js`. Following the
    // published type alone leaves the hook silently dead, with no error and
    // no `servers` entry. Supplying both survives the library correcting the
    // mismatch in either direction.
    patchDocumentOnRequest,
    swaggerOptions: {
      patchDocumentOnRequest,

      /**
       * Runs in the BROWSER. @nestjs/swagger serialises this function into
       * `swagger-ui-init.js` with `.toString()`, so its body must be entirely
       * self-contained: no imports, no module constants, no closure over
       * anything above — hence the inlined `'/api'` rather than
       * `EXPLORER_MOUNT`.
       *
       * This is the belt to `patchDocumentOnRequest`'s braces. That hook
       * depends on a proxy actually sending `X-Forwarded-Prefix`, which is
       * not set by default anywhere; this one derives the prefix from the one
       * fact that is always true and always available — the explorer is being
       * served at `<prefix>/api`, so the page's own location names the
       * prefix. Mounted at the root the prefix is empty and every request
       * passes through untouched.
       */
      requestInterceptor: (req: { url: string }) => {
        const mount = '/api';
        const here = window.location.pathname.replace(/\/+$/, '');
        if (!here.endsWith(mount)) {
          return req;
        }

        const prefix = here.slice(0, here.length - mount.length);
        if (prefix === '') {
          return req;
        }

        const url = new URL(req.url, window.location.origin);
        const alreadyPrefixed =
          url.pathname === prefix || url.pathname.startsWith(prefix + '/');
        if (url.origin === window.location.origin && !alreadyPrefixed) {
          url.pathname = prefix + url.pathname;
          req.url = url.toString();
        }

        return req;
      },
    },
  });
}
