import type {
  Band,
  ChannelWidthMhz,
  LinkId,
  Mode,
} from '@linkops/shared/domain';

/**
 * The stored record: the Link configuration plus identity, version and
 * timestamps. Status is absent on purpose — it is derived from Telemetry
 * Samples the repository has never seen.
 */
export interface LinkRecord {
  id: LinkId;
  name: string;
  siteA: string;
  siteB: string;
  band: Band;
  mode: Mode;
  capacityMbps: number;
  txPowerDbm: number;
  channelWidthMhz: ChannelWidthMhz;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** The eight operator-editable fields, before the repository assigns identity. */
export type LinkDraft = Omit<
  LinkRecord,
  'id' | 'version' | 'createdAt' | 'updatedAt'
>;

/**
 * Any subset of the editable fields — an operator edits what they changed.
 * Named for the draft it patches, not for `linkPatchSchema`: this one carries
 * no `version`, because the version travels as `update`'s own argument.
 */
export type LinkDraftPatch = Partial<LinkDraft>;

/**
 * `band` and `q` are the only fields the repository filters on — `status` is
 * derived from Samples the repository has never seen, so status filtering
 * lives above it, in `server/links-api`.
 */
export interface LinkFilter {
  band?: Band;
  /** Free-text search across name, siteA and siteB, case-insensitive. */
  q?: string;
}

/**
 * Name uniqueness is an invariant of the collection, so `create` reports a
 * duplicate name as a result rather than throwing — the same "repository
 * knows nothing about HTTP" shape ADR-0008 uses for `update`'s version
 * conflict. The caller (the controller) turns `ok: false` into the HTTP-aware
 * `LinkNameTakenError`, exactly as it already turns `findById`'s `undefined`
 * into `LinkNotFoundError`.
 */
export type CreateLinkResult =
  | { ok: true; link: LinkRecord }
  | { ok: false; reason: 'name-taken' };

/**
 * Every way `update` can decline, and the compare-and-swap itself. Per
 * ADR-0008 the expected version is an argument rather than a field on the
 * patch, so a write that skips the version check cannot be expressed. The
 * conflict case carries the whole current record, not just its version: that
 * is what lets the Console show theirs-versus-mine field by field instead of
 * telling an operator to reload and find the difference by eye.
 *
 * `not-found` and `name-taken` are results here for the same reason
 * `create`'s duplicate name is — the repository has no idea it is serving
 * HTTP, so it reports rather than throws.
 */
export type UpdateLinkResult =
  | { ok: true; link: LinkRecord }
  | { ok: false; reason: 'not-found' }
  // Carries the offending name, where `CreateLinkResult` does not: a create
  // body always has a name, so its caller still holds it, but a patch's name
  // is optional and only the repository knows a rename was attempted at all.
  | { ok: false; reason: 'name-taken'; name: string }
  | { ok: false; reason: 'version-conflict'; current: LinkRecord };

/**
 * The read, create and update surface this ticket needs. `delete` joins this
 * interface with the ticket that needs it.
 */
export interface LinkRepository {
  findById(id: LinkId): LinkRecord | undefined;
  findAll(filter?: LinkFilter): LinkRecord[];
  create(draft: LinkDraft): CreateLinkResult;
  update(
    id: LinkId,
    patch: LinkDraftPatch,
    expectedVersion: number,
  ): UpdateLinkResult;
  count(): number;
}
