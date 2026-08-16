import {
  matchesBandAndQuery,
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
 * instead of the wire so a filtered view stays live. `band` and `q` run
 * through `matchesBandAndQuery`, the same predicate
 * `server/links-data-access`'s repository filters with; `status` compares
 * the kind only, matching `LinksController.findAll`'s own status filter;
 * `sortLinks` is the same function the Server sorts with. None of the three
 * is reimplemented here, so none of the three can drift from its Server
 * counterpart.
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
  const entries: SortableLink[] = links
    .filter(
      (link) =>
        query.status === undefined || link.status.status === query.status,
    )
    .filter((link) => matchesBandAndQuery(link, query))
    .map((link) => ({
      link,
      throughputMbps: latestSample.get(link.id)?.throughputMbps ?? 0,
    }));

  return sortLinks(entries, query.sort, query.dir).map((entry) => entry.link);
}
