import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { FleetStore } from '@linkops/console/data-access';
import { Sparkline, StatusPill, ThroughputBar } from '@linkops/console/ui';
import {
  toLinkId,
  type Link,
  type LinkId,
  type TelemetrySample,
} from '@linkops/shared/domain';
import { HISTORY_WINDOW_MS, LinkHistory } from './link-history';

/**
 * Drilling into a single Link: its full configuration, its latest Telemetry
 * Sample (RSSI, SNR, Throughput), and a live sparkline of the last 5 minutes
 * of Throughput against Capacity.
 *
 * Enters by reading the Link from the Server over REST (`GET /api/links/:id`),
 * so a deep link or bookmark to a deleted Link produces a real not-found view
 * rather than a spinning or blank screen. Nothing renders until that answer
 * arrives, even when the store already holds the Link: the store cannot
 * distinguish *deleted* from *not yet streamed*, which is the whole reason
 * this route asks the Server. Once the Server has answered, the store takes
 * over for liveness, so a Status change or an edit in another tab lands here.
 *
 * `LinkHistory` is provided directly on this component, binding its lifetime to
 * the route so history is held for the viewed Link only and dropped
 * structurally upon navigating away.
 */
@Component({
  selector: 'lib-link-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Sparkline, StatusPill, ThroughputBar],
  providers: [LinkHistory],
  template: `
    <div class="detail-container">
      <nav class="breadcrumb">
        <a routerLink="/links" class="back-link">← Fleet</a>
      </nav>

      @if (notFound()) {
        <div class="not-found">
          <h2>Link Not Found</h2>
          <p>This Link does not exist or may have been deleted.</p>
          <a routerLink="/links" class="return-link"
            >Return to Fleet overview</a
          >
        </div>
      } @else if (unreachable()) {
        <div class="unreachable">
          <h2>Link Unavailable</h2>
          <p>
            The Server did not answer, so whether this Link still exists is
            unknown.
          </p>
          <a routerLink="/links" class="return-link"
            >Return to Fleet overview</a
          >
        </div>
      } @else if (currentLink(); as link) {
        <header class="detail-header">
          <div class="title-row">
            <h1>{{ link.name }}</h1>
            <lib-status-pill [status]="link.status" />
          </div>
          <p class="sites-summary">
            <span class="site-from">{{ link.siteA }}</span>
            <span class="site-arrow" aria-hidden="true"> → </span>
            <span class="site-to">{{ link.siteB }}</span>
          </p>
        </header>

        <div class="detail-grid">
          <!-- Configuration -->
          <section class="card config-card">
            <h2>Configuration</h2>
            <dl class="property-list">
              <div class="property-row">
                <dt>Sites</dt>
                <dd>{{ link.siteA }} → {{ link.siteB }}</dd>
              </div>
              <div class="property-row">
                <dt>Band</dt>
                <dd>{{ link.band }}</dd>
              </div>
              <div class="property-row">
                <dt>Mode</dt>
                <dd>{{ link.mode }}</dd>
              </div>
              <div class="property-row">
                <dt>Capacity</dt>
                <dd>{{ link.capacityMbps }} Mbps</dd>
              </div>
              <div class="property-row">
                <dt>Tx Power</dt>
                <dd>{{ link.txPowerDbm }} dBm</dd>
              </div>
              <div class="property-row">
                <dt>Channel Width</dt>
                <dd>{{ link.channelWidthMhz }} MHz</dd>
              </div>
            </dl>
          </section>

          <!-- Latest Telemetry Sample -->
          <section class="card telemetry-card">
            <h2>Live Telemetry</h2>
            <dl class="property-list">
              <div class="property-row">
                <dt>Status</dt>
                <dd><lib-status-pill [status]="link.status" /></dd>
              </div>
              <div class="property-row">
                <dt>RSSI</dt>
                <dd class="mono-value">{{ rssi() }}</dd>
              </div>
              <div class="property-row">
                <dt>SNR</dt>
                <dd class="mono-value">{{ snr() }}</dd>
              </div>
              <div class="property-row">
                <dt>Throughput</dt>
                <dd>
                  <lib-throughput-bar
                    [throughputMbps]="currentThroughput()"
                    [capacityMbps]="link.capacityMbps"
                  />
                </dd>
              </div>
            </dl>
          </section>
        </div>

        <!-- Telemetry History Sparkline -->
        <section class="card history-card">
          <div class="history-header">
            <h2>Throughput (last 5 minutes)</h2>
          </div>
          @if (history.historyUnavailable()) {
            <p class="history-unavailable">
              History could not be loaded — the chart shows only Samples that
              have arrived since.
            </p>
          }
          <lib-sparkline
            [samples]="history.samples()"
            [capacityMbps]="link.capacityMbps"
            [windowMs]="historyWindowMs"
          />
        </section>
      } @else {
        <div class="loading">
          <p>Loading Link details...</p>
        </div>
      }
    </div>
  `,
  styles: `
    .detail-container {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .breadcrumb {
      margin-bottom: var(--space-1);
    }

    .back-link,
    .return-link {
      display: inline-flex;
      align-items: center;
      color: var(--accent);
      font-weight: var(--font-weight-medium);
      text-decoration: none;
    }

    .back-link:hover,
    .return-link:hover {
      text-decoration: underline;
    }

    .detail-header {
      background: var(--surface-raised);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: var(--space-3);
    }

    .title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
    }

    h1 {
      margin: 0;
      font-family: var(--font-family-heading);
      font-size: var(--font-size-heading);
      font-weight: var(--font-weight-strong);
    }

    h2 {
      margin: 0 0 var(--space-2);
      font-family: var(--font-family-heading);
      font-size: var(--font-size-body);
      font-weight: var(--font-weight-strong);
    }

    .sites-summary {
      margin: var(--space-1) 0 0;
      color: var(--text-muted);
    }

    .detail-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-3);
    }

    .card {
      background: var(--surface-raised);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: var(--space-3);
    }

    .property-list {
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .property-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: var(--space-1);
      border-bottom: 1px solid var(--divider);
    }

    .property-row:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }

    dt {
      color: var(--text-muted);
      font-size: var(--font-size-small);
    }

    dd {
      margin: 0;
      font-weight: var(--font-weight-medium);
      text-align: right;
    }

    .mono-value {
      font-family: var(--font-family-mono);
      font-variant-numeric: tabular-nums;
    }

    .history-header {
      margin-bottom: var(--space-2);
    }

    .history-unavailable {
      margin: 0 0 var(--space-2);
      color: var(--text-muted);
      font-size: var(--font-size-small);
    }

    .not-found,
    .unreachable,
    .loading {
      background: var(--surface-raised);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: var(--space-4);
      text-align: center;
    }

    .not-found p,
    .unreachable p {
      color: var(--text-muted);
      margin-bottom: var(--space-3);
    }
  `,
})
export class LinkDetailPage {
  readonly id = input.required<string>();

  private readonly http = inject(HttpClient);
  private readonly store = inject(FleetStore);
  protected readonly history = inject(LinkHistory);

  protected readonly linkId = computed<LinkId>(() => toLinkId(this.id()));
  protected readonly historyWindowMs = HISTORY_WINDOW_MS;

  private readonly loadedLink = signal<Link | null>(null);
  private readonly initialSample = signal<TelemetrySample | null>(null);

  /** The Server answered 404: this Link is gone, and saying so is honest. */
  protected readonly notFound = signal<boolean>(false);

  /**
   * The Server did not answer at all — a Transport Failure, in `CONTEXT.md`'s
   * terms. Kept apart from `notFound` because a timeout or a 502 is not
   * evidence of a deletion, and rendering one as the other would claim a
   * certainty only the Server has.
   */
  protected readonly unreachable = signal<boolean>(false);

  /**
   * The Link being viewed. `null` until the Server has answered, even when the
   * store already holds this Link — otherwise a bookmark to a deleted Link
   * would paint from the store and never reach the not-found state. After the
   * answer, the store wins so live Status and edits land here.
   */
  protected readonly currentLink = computed<Link | null>(() => {
    const loaded = this.loadedLink();
    if (loaded === null) {
      return null;
    }

    const id = this.linkId();

    return this.store.links().find((l) => l.id === id) ?? loaded;
  });

  /**
   * The latest Telemetry Sample: live off the store when the stream has
   * delivered one, otherwise the Sample that came with the REST read.
   */
  private readonly latestSample = computed<TelemetrySample | null>(() => {
    const id = this.linkId();
    const live = this.store.latestSample().get(id);

    if (live !== undefined) {
      return live;
    }

    return this.initialSample();
  });

  protected readonly rssi = computed(() => {
    const s = this.latestSample();
    return s !== null ? `${s.rssiDbm} dBm` : '—';
  });

  protected readonly snr = computed(() => {
    const s = this.latestSample();
    return s !== null ? `${s.snrDb} dB` : '—';
  });

  protected readonly currentThroughput = computed(() => {
    const s = this.latestSample();
    return s !== null ? s.throughputMbps : null;
  });

  constructor() {
    effect(() => {
      const id = this.linkId();

      this.notFound.set(false);
      this.unreachable.set(false);
      this.loadedLink.set(null);
      this.initialSample.set(null);

      this.history.load(id);

      this.http
        .get<{
          link: Link;
          latestSample: TelemetrySample | null;
        }>(`/api/links/${id}`)
        .subscribe({
          next: ({ link, latestSample }) => {
            this.loadedLink.set(link);
            this.initialSample.set(latestSample);
          },
          // Only a 404 means the Link is gone. Everything else — offline, a
          // timeout, a 500, a proxy's 502 — is the Server not answering, and
          // the two get different words.
          error: (cause: unknown) => {
            const isNotFound =
              cause instanceof HttpErrorResponse && cause.status === 404;

            if (isNotFound) {
              this.notFound.set(true);
            } else {
              this.unreachable.set(true);
            }
          },
        });
    });
  }
}
