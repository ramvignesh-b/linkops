import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { applyListQuery, FleetStore } from '@linkops/console/data-access';
import {
  FleetFilterBar,
  KpiTile,
  StatusPill,
  ThroughputBar,
} from '@linkops/console/ui';
import {
  linkListQuerySchema,
  type Band,
  type LinkId,
  type LinkListQuery,
  type LinkSortKey,
  type LinkStatusKind,
  type SortDir,
} from '@linkops/shared/domain';

/** The `LinkListQuery` fields a control can change, one key at a time. */
type QueryPatch = Partial<{
  status: LinkStatusKind | null;
  band: Band | null;
  q: string | null;
  sort: LinkSortKey;
  dir: SortDir;
}>;

/** The defaults every field falls back to — an empty query string, parsed. */
const DEFAULT_QUERY: LinkListQuery = linkListQuerySchema.parse({});

/**
 * The Fleet, every Link on one screen: its name, its two Sites, its Band, the
 * Status the Server derived for it, and its Throughput against the Capacity it
 * is provisioned for — narrowed and ordered by the query string.
 *
 * The one component on this route that reads the store or the router; the
 * filter bar beneath it takes inputs and emits outputs, and everything else it
 * renders with takes inputs and reaches nothing. It renders the Summary
 * verbatim and the Status unchanged — no counting, no thresholds, and no
 * clock — and the Summary describes the whole Fleet regardless of the filter,
 * so a filter can never hide a `down` Link from the counts above it.
 *
 * Filter and sort parameters arrive as component inputs bound by the router,
 * not a subscription this component has to keep in step by hand, and they are
 * re-parsed with the same `linkListQuerySchema` the Server's validation pipe
 * runs — the same vocabulary on both sides of the wire. A query string that
 * fails to parse — a mistyped `status`, an unknown `sort` key — is not an
 * operator's mistake to be shown an error for: it falls back to the defaults
 * and the URL is rewritten to match, silently.
 */
@Component({
  selector: 'lib-fleet-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FleetFilterBar, KpiTile, RouterLink, StatusPill, ThroughputBar],
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

    <lib-fleet-filter-bar
      [status]="query().status"
      [band]="query().band"
      [q]="query().q"
      [sort]="query().sort"
      [dir]="query().dir"
      (statusChange)="updateQuery({ status: $event })"
      (bandChange)="updateQuery({ band: $event })"
      (qChange)="updateQuery({ q: $event })"
      (sortChange)="updateQuery({ sort: $event })"
      (dirChange)="updateQuery({ dir: $event })"
    />

    <table>
      <thead>
        <tr>
          <th scope="col">Link</th>
          <th scope="col">Sites</th>
          <th scope="col">Band</th>
          <th scope="col" class="col-status">Status</th>
          <th scope="col" class="col-throughput">Throughput</th>
        </tr>
      </thead>
      <tbody>
        @for (link of visibleLinks(); track link.id) {
          <tr [attr.data-link-id]="link.id">
            <td class="cell-name">{{ link.name }}</td>
            <td class="cell-sites">
              <span class="site-from">{{ link.siteA }}</span>
              <span class="site-arrow" aria-hidden="true"> → </span>
              <span class="site-to">{{ link.siteB }}</span>
            </td>
            <td class="cell-band">{{ link.band }}</td>
            <td class="cell-status">
              <lib-status-pill [status]="link.status" />
            </td>
            <td class="cell-throughput">
              <lib-throughput-bar
                [throughputMbps]="throughputOf(link.id)"
                [capacityMbps]="link.capacityMbps"
              />
            </td>
          </tr>
        } @empty {
          <tr>
            <td class="empty" colspan="5">No Links match this filter.</td>
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
      font-family: var(--font-family-heading);
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
      font-weight: var(--font-weight-medium);
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
      font-family: var(--font-family-heading);
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

    .cell-sites {
      white-space: nowrap;
    }

    .site-from,
    .site-to {
      color: var(--text-primary);
      font-weight: var(--font-weight-medium);
    }

    .site-arrow {
      margin: 0 var(--space-1);
      color: var(--text-muted);
      font-size: var(--font-size-small);
      user-select: none;
    }

    .cell-band {
      font-family: var(--font-family-mono);
      font-size: var(--font-size-small);
      color: var(--text-muted);
    }

    .col-status,
    .cell-status {
      min-width: 180px;
      width: 180px;
    }

    .col-throughput,
    .cell-throughput {
      min-width: 220px;
    }

    .empty {
      color: var(--text-muted);
    }
  `,
})
export class FleetPage {
  private readonly store = inject(FleetStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  // Bound by the router (withComponentInputBinding), one input per query
  // parameter — raw strings, undefined when absent. Named to match the query
  // string exactly, which is what the binding matches inputs against.
  readonly status = input<string>();
  readonly band = input<string>();
  readonly q = input<string>();
  readonly sort = input<string>();
  readonly dir = input<string>();

  protected readonly links = this.store.links;
  protected readonly summary = this.store.summary;
  private readonly latestSample = this.store.latestSample;

  /**
   * The query string, parsed with the same schema the Server's validation
   * pipe runs. An unparseable query — a mistyped `status`, an unknown `sort`
   * key — is not rendered as an error: it resolves to the defaults here, and
   * the `effect` below rewrites the URL to match.
   */
  protected readonly query = computed<LinkListQuery>(() => {
    const parsed = linkListQuerySchema.safeParse({
      status: this.status(),
      band: this.band(),
      q: this.q(),
      sort: this.sort(),
      dir: this.dir(),
    });

    return parsed.success ? parsed.data : DEFAULT_QUERY;
  });

  /** Filtered and sorted over the store — a later Tick moves a Link into or out of this with no refetch. */
  protected readonly visibleLinks = computed(() =>
    applyListQuery(this.links(), this.latestSample(), this.query()),
  );

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
   *
   * Read off the whole Roster, never the filtered view: the worst Link in the
   * Fleet does not stop being the worst Link because the current filter hides
   * it.
   */
  protected readonly worstLink = computed(() => {
    const worstLinkId = this.summary()?.worstLinkId ?? null;

    if (worstLinkId === null) {
      return null;
    }

    const link = this.links().find((candidate) => candidate.id === worstLinkId);

    return { id: worstLinkId, name: link?.name ?? worstLinkId };
  });

  constructor() {
    // An unparseable query string rewrites the URL rather than rendering an
    // error — a mistyped address is not a failure the operator took an action
    // to cause, and it is the one deliberate exception to this Console
    // surfacing every failure. `replaceUrl` keeps the broken address off the
    // back stack, since it was never a state worth returning to.
    effect(() => {
      const raw = {
        status: this.status(),
        band: this.band(),
        q: this.q(),
        sort: this.sort(),
        dir: this.dir(),
      };

      if (!linkListQuerySchema.safeParse(raw).success) {
        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: {},
          replaceUrl: true,
        });
      }
    });
  }

  protected throughputOf(linkId: LinkId): number | null {
    return this.latestSample().get(linkId)?.throughputMbps ?? null;
  }

  /** One control changed: merged into the query string, which is the state. */
  protected updateQuery(patch: QueryPatch): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: patch,
      queryParamsHandling: 'merge',
    });
  }
}
