import type { HttpInterceptorFn } from '@angular/common/http';

/**
 * Resolves API requests relative to document.baseURI so the Console functions
 * identically whether hosted at root (/) or mounted beneath a reverse-proxy
 * subpath (e.g. /linkops/).
 */
export const apiBaseInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.url.startsWith('/api/') || req.url.startsWith('api/')) {
    const relativePath = req.url.startsWith('/') ? req.url.slice(1) : req.url;
    if (typeof document !== 'undefined' && document.baseURI) {
      const base = document.baseURI.endsWith('/')
        ? document.baseURI
        : document.baseURI + '/';
      const resolved = new URL(relativePath, base).pathname;
      return next(req.clone({ url: resolved }));
    }
  }
  return next(req);
};
