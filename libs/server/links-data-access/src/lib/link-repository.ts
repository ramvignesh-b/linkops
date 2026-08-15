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
 * The read and create surface this ticket needs. `update` and `delete` join
 * this interface with the tickets that need them (editing and deleting a
 * Link) — per ADR-0008, `update(id, patch, expectedVersion)` returns a
 * result, never a throw, because the repository knows nothing about HTTP.
 */
export interface LinkRepository {
  findById(id: LinkId): LinkRecord | undefined;
  findAll(filter?: LinkFilter): LinkRecord[];
  create(draft: LinkDraft): CreateLinkResult;
  count(): number;
}
