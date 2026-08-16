import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { FleetStore } from '@linkops/console/data-access';
import { KpiTile, StatusPill, ThroughputBar } from '@linkops/console/ui';
import type { LinkId } from '@linkops/shared/domain';

/**
 * The Fleet, every Link on one screen: its name, its two Sites, its Band, the
 * Status the Server derived for it, and its Throughput against the Capacity it
 * is provisioned for.
 *
 * The one component on this route that reads the store; everything it renders
 * with takes inputs and reaches nothing. It renders the Summary verbatim and
 * the Status unchanged — no counting, no thresholds, and no clock.
 */
@Component({
  selector: 'lib-fleet-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [KpiTile, RouterLink, StatusPill, ThroughputBar],
  template: `
    <section class="kpi">
      <!--
        Labelled Fleet-wide because that is what it is: these figures come from
        the Server's Summary and describe the whole Fleet, so no view of the
        list can hide a down Link from the counts above it.
      -->
      <h2>Fleet-wide</h2>

      @if (summary(); as summary) {
        <div class="tiles">
          <lib-kpi-tile label="Links" [value]="summary.total" />
          <lib-kpi-tile label="Up" [value]="summary.up" />
          <lib-kpi-tile label="Degraded" [value]="summary.degraded" />
          <lib-kpi-tile label="Down" [value]="summary.down" />
          <lib-kpi-tile label="Total throughput" [value]="totalThroughput()" />
        </div>
        <p class="worst-link">
          @if (worstLink(); as worst) {
            Worst Link:
            <a [routerLink]="['/links', worst.id]">{{ worst.name }}</a> — the
            lowest SNR in the Fleet, and where to start.
          } @else {
            No Link has reported yet, so none of them is the worst.
          }
        </p>
      } @else {
        <p class="waiting">Waiting for the first Fleet Summary.</p>
      }
    </section>

    <table>
      <thead>
        <tr>
          <th scope="col">Link</th>
          <th scope="col">Sites</th>
          <th scope="col">Band</th>
          <th scope="col">Status</th>
          <th scope="col">Throughput</th>
        </tr>
      </thead>
      <tbody>
        @for (link of links(); track link.id) {
          <tr [attr.data-link-id]="link.id">
            <td class="cell-name">{{ link.name }}</td>
            <td class="cell-sites">{{ link.siteA }} → {{ link.siteB }}</td>
            <td class="cell-band">{{ link.band }}</td>
            <td><lib-status-pill [status]="link.status" /></td>
            <td>
              <lib-throughput-bar
                [throughputMbps]="throughputOf(link.id)"
                [capacityMbps]="link.capacityMbps"
              />
            </td>
          </tr>
        } @empty {
          <tr>
            <td class="empty" colspan="5">No Links in the Fleet.</td>
          </tr>
        }
      </tbody>
    </table>
  `,
  styles: `
    .kpi {
      margin-bottom: var(--space-4);
    }

    h2 {
      margin: 0 0 var(--space-2);
      font-size: var(--font-size-heading);
      font-weight: var(--font-weight-strong);
    }

    .tiles {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    .worst-link,
    .waiting {
      margin: var(--space-2) 0 0;
      color: var(--text-muted);
    }

    a {
      color: var(--accent);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--surface-raised);
      border: 1px solid var(--border);
      border-radius: var(--radius);
    }

    th {
      text-align: left;
      color: var(--text-muted);
      font-size: var(--font-size-small);
      font-weight: var(--font-weight-strong);
    }

    th,
    td {
      padding: var(--space-2) var(--space-3);
      border-bottom: 1px solid var(--divider);
    }

    tbody tr:last-child td {
      border-bottom: none;
    }

    .cell-name {
      font-weight: var(--font-weight-strong);
    }

    .cell-sites,
    .cell-band,
    .empty {
      color: var(--text-muted);
    }
  `,
})
export class FleetPage {
  private readonly store = inject(FleetStore);

  protected readonly links = this.store.links;
  protected readonly summary = this.store.summary;
  private readonly latestSample = this.store.latestSample;

  /** Formatted, not computed: the figure itself is the Server's. */
  protected readonly totalThroughput = computed(() => {
    const summary = this.summary();

    return summary === null
      ? ''
      : `${Math.round(summary.totalThroughputMbps)} Mbps`;
  });

  /**
   * The worst Link as something an operator can click, because a callout they
   * cannot act on is decoration. It falls back to the id when the Summary names
   * a Link the Roster has not caught up with — the Summary is never a source of
   * membership, so this is a real state rather than an inconsistency.
   */
  protected readonly worstLink = computed(() => {
    const worstLinkId = this.summary()?.worstLinkId ?? null;

    if (worstLinkId === null) {
      return null;
    }

    const link = this.links().find((candidate) => candidate.id === worstLinkId);

    return { id: worstLinkId, name: link?.name ?? worstLinkId };
  });

  protected throughputOf(linkId: LinkId): number | null {
    return this.latestSample().get(linkId)?.throughputMbps ?? null;
  }
}
