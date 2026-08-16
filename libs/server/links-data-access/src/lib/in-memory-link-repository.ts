import {
  matchesBandAndQuery,
  toLinkId,
  type LinkId,
} from '@linkops/shared/domain';
import type {
  CreateLinkResult,
  LinkDraft,
  LinkDraftPatch,
  LinkFilter,
  LinkRecord,
  LinkRepository,
  UpdateLinkResult,
} from './link-repository';

export class InMemoryLinkRepository implements LinkRepository {
  private readonly links = new Map<LinkId, LinkRecord>();
  // Scoped to the instance, not the module — a module-level counter would
  // keep incrementing across repositories, so two boots in the same process
  // (as happens whenever more than one test module or app instance runs)
  // would no longer produce the same fleet.
  private nextIdSuffix = 1;

  findById(id: LinkId): LinkRecord | undefined {
    const stored = this.links.get(id);

    return stored === undefined ? undefined : { ...stored };
  }

  create(draft: LinkDraft): CreateLinkResult {
    if (this.hasName(draft.name)) {
      return { ok: false, reason: 'name-taken' };
    }

    const now = new Date().toISOString();
    const record: LinkRecord = {
      ...draft,
      id: toLinkId(`lnk_${String(this.nextIdSuffix++).padStart(4, '0')}`),
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    this.links.set(record.id, record);

    return { ok: true, link: { ...record } };
  }

  update(
    id: LinkId,
    patch: LinkDraftPatch,
    expectedVersion: number,
  ): UpdateLinkResult {
    const stored = this.links.get(id);

    if (stored === undefined) {
      return { ok: false, reason: 'not-found' };
    }

    if (stored.version !== expectedVersion) {
      return { ok: false, reason: 'version-conflict', current: { ...stored } };
    }

    // Scoped to *other* Links: a patch that resends the Link's own name is a
    // no-op rename, not a collision, and rejecting it would make round-tripping
    // a whole form impossible without diffing it first.
    if (patch.name !== undefined && this.hasName(patch.name, id)) {
      return { ok: false, reason: 'name-taken', name: patch.name };
    }

    const updated: LinkRecord = {
      ...stored,
      ...patch,
      version: stored.version + 1,
      updatedAt: new Date().toISOString(),
    };

    this.links.set(id, updated);

    return { ok: true, link: { ...updated } };
  }

  delete(id: LinkId): boolean {
    return this.links.delete(id);
  }

  count(): number {
    return this.links.size;
  }

  findAll(filter: LinkFilter = {}): LinkRecord[] {
    return [...this.links.values()]
      .filter((link) => matchesBandAndQuery(link, filter))
      .map((link) => ({ ...link }));
  }

  /** `exceptId` lets a rename ignore the Link doing the renaming. */
  private hasName(name: string, exceptId?: LinkId): boolean {
    for (const link of this.links.values()) {
      if (link.name === name && link.id !== exceptId) return true;
    }

    return false;
  }
}
