import { provideHttpClient } from '@angular/common/http';
import {
  type ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { appRoutes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes),
    // AssistantClient (console/data-access) needs one whether this app is
    // serving standalone or is mounted, remotely, inside the host — the
    // host's own HttpClient never crosses the federation boundary.
    provideHttpClient(),
  ],
};
