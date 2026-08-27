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
  // Everything @nestjs/swagger is handed in `swaggerOptions` is serialised
  // into `swagger-ui-init.js` and shipped to the browser, comments included,
  // so the reasoning lives out here rather than inside the function bodies.
  //
  // `patchDocumentOnRequest` is used for its side effects. The document needs
  // no patching — `servers` is already empty and stays that way, deliberately:
  //
  //   Every hop in front of this Server has an opinion about the path, and any
  //   of them may report the whole public API base rather than the segment it
  //   stripped. Being handed `/linkops/api` when this document's paths already
  //   begin with `/api` yields `/linkops/api/api/...` for every operation, and
  //   chasing that back through the hops is unbounded — there is no header the
  //   Server can trust. The browser cannot be lied to about where it is: the
  //   explorer is served at `<prefix>/api` by construction, so `window.location`
  //   names the prefix exactly. An empty `servers` is what hands the job to
  //   `requestInterceptor`, which derives and applies it there.
  //
  // What the hook does do is stop the response being cached. It is generated
  // per request, but its name ends in `.js`, so every layer that decides
  // cacheability by extension — a CDN's default static rules, an `expires 1y`
  // nginx block, the browser — treats it as immutable and stops asking the
  // origin. The symptom is indistinguishable from the hook being broken: a
  // stale document served forever, with no request arriving to say so. Same
  // reasoning as the no-store rule the Console's nginx applies to
  // `remoteEntry.json`.
  //
  // `GET /api/openapi.json` still honours `X-Forwarded-Prefix`: a codegen
  // client fetching the raw document has no browser to ask.
  const patchDocumentOnRequest = (
    req: unknown,
    res: unknown,
    doc: OpenAPIObject,
  ): OpenAPIObject => {
    (res as { setHeader?: (name: string, value: string) => void })?.setHeader?.(
      'Cache-Control',
      'no-store, no-cache, must-revalidate',
    );

    const headers = (
      req as { headers?: Record<string, string | string[] | undefined> }
    )?.headers;
    logger.log(
      `explorer document: host=${String(headers?.['host'] ?? '?')} ` +
        `x-forwarded-prefix=${resolveForwardedPrefix(headers) ?? '(unset)'} ` +
        '-> servers=[] (ignored; the browser resolves its own base path)',
    );

    return withBasePath(doc, undefined);
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
       * Runs in the BROWSER — serialised with `.toString()`, so its body must
       * be self-contained: no imports, no module constants, no closure over
       * anything above. Hence the inlined `'/api'` rather than
       * `EXPLORER_MOUNT`. See the note above `patchDocumentOnRequest` for why
       * this, and not a forwarded header, decides the base path.
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
