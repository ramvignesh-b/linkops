import { toLinkId, type LinkId } from '@linkops/shared/domain';
import type {
  CreateLinkResult,
  LinkDraft,
  LinkFilter,
  LinkRecord,
  LinkRepository,
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

  count(): number {
    return this.links.size;
  }

  findAll(filter: LinkFilter = {}): LinkRecord[] {
    const q = filter.q?.toLowerCase();

    return [...this.links.values()]
      .filter((link) => filter.band === undefined || link.band === filter.band)
      .filter(
        (link) =>
          q === undefined ||
          link.name.toLowerCase().includes(q) ||
          link.siteA.toLowerCase().includes(q) ||
          link.siteB.toLowerCase().includes(q),
      )
      .map((link) => ({ ...link }));
  }

  private hasName(name: string): boolean {
    for (const link of this.links.values()) {
      if (link.name === name) return true;
    }

    return false;
  }
}
