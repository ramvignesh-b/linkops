import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { Subscription } from 'rxjs';
import { FleetStore } from '@linkops/console/data-access';
import {
  FleetBreadcrumb,
  Sparkline,
  StatusPill,
  ThroughputBar,
} from '@linkops/console/ui';
import {
  toLinkId,
  type Link,
  type LinkId,
  type TelemetrySample,
} from '@linkops/shared/domain';
import { HISTORY_WINDOW_MS, LinkHistory } from './link-history';
import { isNotFoundError } from './is-not-found';

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
  imports: [FleetBreadcrumb, RouterLink, Sparkline, StatusPill, ThroughputBar],
  providers: [LinkHistory],
  template: `
    <div class="detail-container">
      <lib-fleet-breadcrumb />

      @if (notFound()) {
        <div class="not-found">
          <h2>Link Not Found</h2>
          <p>This Link does not exist or may have been deleted.</p>
          <a routerLink="/links" class="return-link">Return to Fleet</a>
        </div>
      } @else if (unreachable()) {
        <div class="unreachable">
          <h2>Link Unavailable</h2>
          <p>
            The Server did not answer, so whether this Link still exists is
            unknown.
          </p>
          <a routerLink="/links" class="return-link">Return to Fleet</a>
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
          <div class="header-actions">
            <a [routerLink]="['/links', link.id, 'edit']" class="edit-action"
              >Edit</a
            >
            <button
              type="button"
              class="delete-action"
              (click)="onDeleteClick()"
            >
              Delete
            </button>
          </div>
          @if (confirmingDelete()) {
            <div class="delete-confirm">
              <p>Delete "{{ link.name }}"? This cannot be undone.</p>
              @if (deleteUnreachable()) {
                <p class="unreachable">
                  The Server did not answer. Nothing was deleted — try again.
                </p>
              }
              <button
                type="button"
                class="confirm-delete"
                [disabled]="deleting()"
                (click)="onConfirmDelete(link.id)"
              >
                {{ deleting() ? 'Deleting…' : 'Confirm delete' }}
              </button>
              <button
                type="button"
                class="cancel-delete"
                (click)="onCancelDelete()"
              >
                Cancel
              </button>
            </div>
          }
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

    .return-link {
      display: inline-flex;
      align-items: center;
      color: var(--accent);
      font-weight: var(--font-weight-medium);
      text-decoration: none;
    }

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

    .header-actions {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      margin-top: var(--space-2);
    }

    .edit-action {
      display: inline-flex;
      align-items: center;
      padding: var(--space-1) var(--space-2);
      background: var(--surface-raised);
      color: var(--accent);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      font-weight: var(--font-weight-medium);
      text-decoration: none;
    }

    .edit-action:hover {
      border-color: var(--accent);
      text-decoration: none;
    }

    .delete-action {
      display: inline-flex;
      align-items: center;
      padding: var(--space-1) var(--space-2);
      background: transparent;
      color: var(--status-down);
      border: 1px solid var(--status-down);
      border-radius: var(--radius);
      font-weight: var(--font-weight-medium);
      cursor: pointer;
    }

    .delete-confirm {
      margin-top: var(--space-2);
      padding: var(--space-2);
      background: var(--surface-raised);
      border: 1px solid var(--status-down);
      border-radius: var(--radius);
    }

    .delete-confirm p {
      margin: 0 0 var(--space-2);
    }

    .delete-confirm .confirm-delete {
      background: var(--status-down);
      color: var(--surface-raised);
      border: none;
      border-radius: var(--radius);
      padding: var(--space-1) var(--space-3);
      font-weight: var(--font-weight-medium);
      cursor: pointer;
      margin-right: var(--space-2);
    }

    .delete-confirm .cancel-delete {
      background: transparent;
      color: var(--text-primary);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: var(--space-1) var(--space-3);
      cursor: pointer;
    }

    .detail-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-3);
      min-width: 0;
    }

    .card {
      background: var(--surface-raised);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: var(--space-3);
      min-width: 0;
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
      gap: var(--space-2);
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
      flex-shrink: 0;
    }

    dd {
      margin: 0;
      font-weight: var(--font-weight-medium);
      text-align: right;
      min-width: 0;
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
  private readonly router = inject(Router);
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
    return s !== null ? `${Number(s.rssiDbm.toFixed(1))} dBm` : '—';
  });

  protected readonly snr = computed(() => {
    const s = this.latestSample();
    return s !== null ? `${Number(s.snrDb.toFixed(1))} dB` : '—';
  });

  protected readonly currentThroughput = computed(() => {
    const s = this.latestSample();
    return s !== null ? s.throughputMbps : null;
  });

  /** Named confirmation, per the ticket: revealed by "Delete", withdrawn by "Cancel". */
  protected readonly confirmingDelete = signal(false);
  protected readonly deleting = signal(false);
  protected readonly deleteUnreachable = signal(false);
  private deleteSubscription: Subscription | null = null;

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
          error: (cause: unknown) => {
            if (isNotFoundError(cause)) {
              this.notFound.set(true);
            } else {
              this.unreachable.set(true);
            }
          },
        });
    });
  }

  protected onDeleteClick(): void {
    this.confirmingDelete.set(true);
  }

  /**
   * Withdraws the confirmation and, if a delete is in flight, cancels it —
   * unsubscribing an `HttpClient` request aborts it, so an operator who
   * cancels never has that request land anyway and navigate them away once
   * it settles.
   */
  protected onCancelDelete(): void {
    this.deleteSubscription?.unsubscribe();
    this.deleteSubscription = null;
    this.confirmingDelete.set(false);
    this.deleting.set(false);
    this.deleteUnreachable.set(false);
  }

  /**
   * Removes it from the store the moment the Server confirms it, rather than
   * lingering until the membership event a Tick later — that frame arrives
   * on a Link already gone, and `FleetStore.removeLink` is what makes that
   * harmless. A 404 here means the same thing happened from somewhere else,
   * so it is treated the same as success rather than surfaced as a failure.
   */
  protected onConfirmDelete(id: LinkId): void {
    this.deleting.set(true);
    this.deleteUnreachable.set(false);

    this.deleteSubscription = this.http
      .delete<void>(`/api/links/${id}`)
      .subscribe({
        next: () => {
          this.deleteSubscription = null;
          this.finishDelete(id);
        },
        error: (cause: unknown) => {
          this.deleteSubscription = null;

          if (isNotFoundError(cause)) {
            this.finishDelete(id);

            return;
          }

          this.deleting.set(false);
          this.deleteUnreachable.set(true);
        },
      });
  }

  private finishDelete(id: LinkId): void {
    this.store.removeLink(id);
    this.router.navigate(['/links']);
  }
}
