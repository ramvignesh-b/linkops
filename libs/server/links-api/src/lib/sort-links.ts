import type { Link, LinkSortKey, SortDir } from '@linkops/shared/domain';

/**
 * A Link paired with the one Sample-derived field a sort key can need but
 * `Link` itself does not carry. `throughputMbps` reads 0 for a Link with no
 * Sample — the same "no data" default `deriveStatus` reaches for staleness.
 */
export interface SortableLink {
  link: Link;
  throughputMbps: number;
}

/**
 * Orders `entries` by `sort`/`dir`, then always by `id` ascending — the total
 * order that makes two identical requests return an identical result. The
 * tiebreak direction never flips with `dir`: `id` has no "reverse" meaning of
 * its own, so flipping it would just be a second way to get the same rows in
 * a different, equally arbitrary order.
 */
export function sortLinks(
  entries: readonly SortableLink[],
  sort: LinkSortKey,
  dir: SortDir,
): SortableLink[] {
  const direction = dir === 'desc' ? -1 : 1;

  return [...entries].sort((a, b) => {
    const primary = comparePrimary(a, b, sort) * direction;

    return primary !== 0 ? primary : a.link.id.localeCompare(b.link.id);
  });
}

function comparePrimary(
  a: SortableLink,
  b: SortableLink,
  sort: LinkSortKey,
): number {
  switch (sort) {
    case 'name':
      return a.link.name.localeCompare(b.link.name);
    case 'capacityMbps':
      return a.link.capacityMbps - b.link.capacityMbps;
    case 'status':
      return a.link.status.status.localeCompare(b.link.status.status);
    case 'throughputMbps':
      return a.throughputMbps - b.throughputMbps;
  }
}
