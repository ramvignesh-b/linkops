import { provideHttpClient } from '@angular/common/http';
import {
  type ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import {
  EVENT_SOURCE,
  type EventSourceLike,
} from '@linkops/console/data-access';
import { appRoutes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // withComponentInputBinding makes the query string the state for filter
    // and sort: FleetPage reads it as component inputs rather than a
    // subscription it has to keep in step with the URL by hand.
    provideRouter(appRoutes, withComponentInputBinding()),
    provideHttpClient(),
    {
      // The real stream. Reconnection is the browser's, driven by the
      // `retry: 3000` the Server sends on every connection (ADR-0005) — there
      // is no backoff of our own competing with it.
      provide: EVENT_SOURCE,
      useValue: (url: string): EventSourceLike => new EventSource(url),
    },
  ],
};
