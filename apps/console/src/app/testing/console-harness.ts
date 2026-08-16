import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import {
  EVENT_SOURCE,
  STREAM_REOPEN_DELAY_MS,
  type EventSourceLike,
} from '@linkops/console/data-access';
import type {
  FleetSummary,
  Link,
  StreamEventName,
} from '@linkops/shared/domain';
import { App } from '../app';
import { appConfig } from '../app.config';

/**
 * The stream, faked at the one place the Console touches the browser's
 * network primitives. It exists because **jsdom has no `EventSource`** —
 * without the `EVENT_SOURCE` token these tests could not run at all — and it
 * emits synchronously, which is why no test waits on the clock.
 */
export class FakeEventSource implements EventSourceLike {
  private readonly listeners = new Map<
    string,
    ((event: MessageEvent<string>) => void)[]
  >();

  closed = false;

  /** OPEN, until a test says the browser is retrying (0) or has given up (2). */
  readyState = 1;

  constructor(readonly url: string) {}

  addEventListener(
    type: string,
    listener: (event: MessageEvent<string>) => void,
  ): void {
    const existing = this.listeners.get(type) ?? [];
    this.listeners.set(type, [...existing, listener]);
  }

  close(): void {
    this.closed = true;
  }

  /** One frame as the Server writes it: a named event, JSON data, the Tick as `id:`. */
  emit(event: StreamEventName, data: unknown, tick: number): void {
    this.emitRaw(event, JSON.stringify(data), tick);
  }

  emitRaw(event: string, data: string, tick = 0): void {
    const message = new MessageEvent<string>(event, {
      data,
      lastEventId: String(tick),
    });

    for (const listener of this.listeners.get(event) ?? []) {
      listener(message);
    }
  }

  /** What the browser dispatches when the connection goes. */
  fail(): void {
    this.emitRaw('error', '');
  }
}

/**
 * Yields to the macrotask queue, which is where a stream reopen is scheduled.
 * Not a sleep: with the delay at zero the reopen is already queued ahead of
 * this, so FIFO ordering — not elapsed time — is what makes it deterministic.
 */
export const nextMacrotask = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

/**
 * The routed Console, booted from the application's own provider list with
 * only the two browser network primitives replaced. Everything between the
 * wire and the DOM — schema validation, the store and its Tick coalescer, the
 * router, `console/ui` — is the code that ships.
 *
 * `path` is the initial navigation, `/links` by default; a test asserting on
 * a query string passes it explicitly (`/links?status=degraded`) so the
 * filter and sort are live from the first render rather than applied after.
 */
export async function bootConsole(path = '/links'): Promise<{
  fixture: ComponentFixture<App>;
  http: HttpTestingController;
  router: Router;
  stream: () => FakeEventSource;
}> {
  const sources: FakeEventSource[] = [];

  TestBed.configureTestingModule({
    providers: [
      ...appConfig.providers,
      provideHttpClientTesting(),
      // The reopen cadence is the Server's 3 seconds in the application; here
      // it is the next macrotask, so a test waits on ordering rather than on
      // the clock.
      { provide: STREAM_REOPEN_DELAY_MS, useValue: 0 },
      {
        provide: EVENT_SOURCE,
        useValue: (url: string): EventSourceLike => {
          const source = new FakeEventSource(url);
          sources.push(source);

          return source;
        },
      },
    ],
  });

  const fixture = TestBed.createComponent(App);
  const router = TestBed.inject(Router);
  await router.navigateByUrl(path);
  await fixture.whenStable();

  return {
    fixture,
    http: TestBed.inject(HttpTestingController),
    router,
    stream: () => {
      const source = sources[sources.length - 1];
      if (source === undefined) throw new Error('the stream was never opened');

      return source;
    },
  };
}

/** First paint: the Roster and the Fleet Summary, together and unfiltered. */
export function answerFirstPaint(
  http: HttpTestingController,
  links: Link[],
  fleetSummary: FleetSummary,
): void {
  const roster = http.expectOne((request) => request.url === '/api/links');
  // No query parameters: the Console loads the whole Roster and filters it
  // itself, so a Link entering a filtered view mid-Tick needs no refetch.
  expect(roster.request.urlWithParams).toBe('/api/links');
  roster.flush(links);
  http.expectOne('/api/fleet/summary').flush(fleetSummary);
}

const text = (element: Element | null): string =>
  (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

const row = (root: HTMLElement, id: Link['id']): HTMLElement => {
  const found = root.querySelector<HTMLElement>(`tr[data-link-id="${id}"]`);
  if (found === null) throw new Error(`no row for ${id}`);

  return found;
};

const control = (
  root: HTMLElement,
  name: string,
): HTMLSelectElement | HTMLInputElement => {
  const found = root.querySelector<HTMLSelectElement | HTMLInputElement>(
    `lib-fleet-filter-bar [name="${name}"]`,
  );
  if (found === null) throw new Error(`no control named ${name}`);

  return found;
};

/** A field control on `lib-link-form`, found by its `name` attribute. */
const formControl = (
  root: HTMLElement,
  name: string,
): HTMLSelectElement | HTMLInputElement => {
  const found = root.querySelector<HTMLSelectElement | HTMLInputElement>(
    `lib-link-form [name="${name}"]`,
  );
  if (found === null) throw new Error(`no form control named ${name}`);

  return found;
};

/** A `dt`/`dd` pair in the detail page's property lists, found by its label. */
const property = (root: HTMLElement, label: string): string => {
  const found = [...root.querySelectorAll('.property-row')].find(
    (candidate) => text(candidate.querySelector('dt')) === label,
  );

  return text(found?.querySelector('dd') ?? null);
};

/** The Link detail route's queries — grouped out of `screen` to keep it inside the lint budget. */
function linkDetailScreen(root: HTMLElement) {
  return {
    detailTitle: () => text(root.querySelector('.detail-header h1')),
    detailValue: (label: string) => property(root, label),
    sparklinePath: () =>
      root.querySelector('svg path.sparkline-path')?.getAttribute('d') ?? null,
    /** The Fleet row's name is the link into the detail route. */
    clickLinkRow: (id: Link['id']) => {
      row(root, id).querySelector('a')?.click();
    },
    notFoundText: () => text(root.querySelector('.not-found')),
    unreachableText: () => text(root.querySelector('.unreachable')),
  };
}

/** The Link create form's queries — grouped out of `screen` for the same reason as `linkDetailScreen`. */
function linkCreateScreen(root: HTMLElement) {
  return {
    /** Sets a form field's value and dispatches the `change` `lib-link-form` listens for. */
    setFormField: (name: string, value: string): void => {
      const element = formControl(root, name);
      element.value = value;
      element.dispatchEvent(new Event('change'));
    },
    submitForm: (): void => {
      root
        .querySelector('lib-link-form form')
        ?.dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true }),
        );
    },
    /** A field's error text, or empty when the control carries none. */
    formFieldError: (field: string): string =>
      text(
        root.querySelector(
          `lib-link-form .field[data-field="${field}"] .field-error`,
        ),
      ),
  };
}

/**
 * DOM queries and control interactions, shared across every app-level test.
 *
 * Its helpers sit outside it rather than closing over `root`, which is what
 * keeps the returned object — one entry per thing a test asks the screen —
 * inside the lint budget as surfaces are added.
 */
export function screen(fixture: ComponentFixture<App>) {
  const root = fixture.nativeElement as HTMLElement;

  /** Sets a control's value and dispatches the `change` the component listens for. */
  const setControl = (name: string, value: string): void => {
    const element = control(root, name);
    element.value = value;
    element.dispatchEvent(new Event('change'));
  };

  return {
    rowNames: () =>
      [...root.querySelectorAll('tbody .cell-name')].map((cell) => text(cell)),
    // Only rows for a Link: the `@empty` row has no `data-link-id`.
    rowIds: () =>
      [...root.querySelectorAll<HTMLElement>('tbody tr[data-link-id]')].map(
        (tr) => tr.dataset['linkId'],
      ),
    status: (id: Link['id']) =>
      text(row(root, id).querySelector('lib-status-pill')),
    throughput: (id: Link['id']) =>
      text(row(root, id).querySelector('lib-throughput-bar')),
    cell: (id: Link['id'], name: string) =>
      text(row(root, id).querySelector(`.cell-${name}`)),
    kpi: (label: string) => {
      const tile = [...root.querySelectorAll('lib-kpi-tile')].find(
        (candidate) => text(candidate.querySelector('.kpi-label')) === label,
      );

      return text(tile?.querySelector('.kpi-value') ?? null);
    },
    worstLinkHref: () =>
      root.querySelector('.worst-link a')?.getAttribute('href') ?? null,
    clickNewLink: () => {
      root.querySelector<HTMLElement>('.new-link-action')?.click();
    },
    banner: () => root.querySelector<HTMLElement>('lib-connection-banner p'),
    heading: () => text(root.querySelector('.kpi h2')),
    setStatus: (value: string) => setControl('status', value),
    setBand: (value: string) => setControl('band', value),
    setQuery: (value: string) => setControl('q', value),
    setSort: (value: string) => setControl('sort', value),
    setDir: (value: string) => setControl('dir', value),

    ...linkDetailScreen(root),
    ...linkCreateScreen(root),
  };
}

/**
 * Ends a test the way closing the Console ends the application: nothing left
 * unanswered, then the environment torn down. Tearing it down is what fires the
 * store's `DestroyRef` — a root-provided store outlives every component, so
 * destroying a fixture is not what releases its stream.
 */
export function finish(): void {
  // Nothing polls: every Tick after first paint arrives over the stream, so an
  // unexpected request here is a regression rather than an oversight.
  TestBed.inject(HttpTestingController).verify();
  TestBed.resetTestingModule();
}
