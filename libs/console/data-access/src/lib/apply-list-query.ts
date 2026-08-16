import {
  sortLinks,
  type Link,
  type LinkId,
  type LinkListQuery,
  type SortableLink,
  type TelemetrySample,
} from '@linkops/shared/domain';

/**
 * Filters and sorts a Roster against a `LinkListQuery` — the Console's own
 * mirror of what `GET /api/links` does server-side, run over the store
 * instead of the wire so a filtered view stays live. `status`, `band` and `q`
 * match `LinksController.findAll`'s semantics exactly (`status` on the kind
 * only, `band` exact, `q` a case-insensitive substring of name, siteA or
 * siteB), and `sortLinks` is the same function the Server sorts with, so the
 * two orderings — ties included — can never drift apart.
 *
 * `throughputMbps` for the sort comes from `latestSample`, reading 0 for a
 * Link with no Sample yet — the same "no data" default the Server's
 * `toSortableEntry` uses, so a Link that has not reported sorts where a
 * silent Link belongs rather than wherever `undefined` would happen to land.
 */
export function applyListQuery(
  links: readonly Link[],
  latestSample: ReadonlyMap<LinkId, TelemetrySample>,
  query: LinkListQuery,
): Link[] {
  const q = query.q?.toLowerCase();

  const entries: SortableLink[] = links
    .filter(
      (link) =>
        query.status === undefined || link.status.status === query.status,
    )
    .filter((link) => query.band === undefined || link.band === query.band)
    .filter(
      (link) =>
        q === undefined ||
        link.name.toLowerCase().includes(q) ||
        link.siteA.toLowerCase().includes(q) ||
        link.siteB.toLowerCase().includes(q),
    )
    .map((link) => ({
      link,
      throughputMbps: latestSample.get(link.id)?.throughputMbps ?? 0,
    }));

  return sortLinks(entries, query.sort, query.dir).map((entry) => entry.link);
}
