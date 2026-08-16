import type { Band } from './link';

/** The fields a `band`/`q` filter reads — what a stored record and a rendered Link have in common. */
export interface BandAndQueryFilterable {
  readonly band: Band;
  readonly name: string;
  readonly siteA: string;
  readonly siteB: string;
}

/**
 * Whether `entity` matches an exact `band` and a case-insensitive substring
 * `q` across name, siteA and siteB — either absent meaning "don't filter on
 * this". Shared by `server/links-data-access`'s repository filter and the
 * Console's own `applyListQuery`, for the same reason `sortLinks` is shared:
 * two independently written predicates for the same words drift apart one
 * edit at a time, and this is the one place either side changes.
 */
export function matchesBandAndQuery(
  entity: BandAndQueryFilterable,
  filter: { band?: Band; q?: string },
): boolean {
  if (filter.band !== undefined && entity.band !== filter.band) {
    return false;
  }

  if (filter.q === undefined) {
    return true;
  }

  const q = filter.q.toLowerCase();

  return (
    entity.name.toLowerCase().includes(q) ||
    entity.siteA.toLowerCase().includes(q) ||
    entity.siteB.toLowerCase().includes(q)
  );
}
