import { toLinkId } from '@linkops/shared/domain';
import type {
  LinkDraft,
  LinkRepository,
  UpdateLinkResult,
} from './link-repository';

const draft = (overrides: Partial<LinkDraft> = {}): LinkDraft => ({
  name: 'North Ridge to Depot',
  siteA: 'North Ridge',
  siteB: 'Depot',
  band: '5GHz',
  mode: 'PtP',
  capacityMbps: 300,
  txPowerDbm: 20,
  channelWidthMhz: 40,
  ...overrides,
});

function createContract(createRepository: () => LinkRepository) {
  describe('create', () => {
    it('creates a Link and finds it by id', () => {
      const repository = createRepository();

      const result = repository.create(draft());
      if (!result.ok) throw new Error('expected create to succeed');
      const found = repository.findById(result.link.id);

      expect(found).toEqual(result.link);
    });

    it('returns a Link that is not the stored instance', () => {
      const repository = createRepository();

      const result = repository.create(draft());
      if (!result.ok) throw new Error('expected create to succeed');
      result.link.name = 'Corrupted';

      expect(repository.findById(result.link.id)?.name).toBe(
        'North Ridge to Depot',
      );
    });

    it('refuses a duplicate name on create', () => {
      const repository = createRepository();

      repository.create(draft({ name: 'North Ridge to Depot' }));
      const result = repository.create(
        draft({ name: 'North Ridge to Depot', siteA: 'Elsewhere' }),
      );

      expect(result).toEqual({ ok: false, reason: 'name-taken' });
      expect(repository.count()).toBe(1);
    });
  });

  describe('count', () => {
    it('counts the Links created so far', () => {
      const repository = createRepository();

      expect(repository.count()).toBe(0);

      repository.create(draft({ name: 'First Link' }));
      repository.create(draft({ name: 'Second Link' }));

      expect(repository.count()).toBe(2);
    });
  });
}

function findAllContract(createRepository: () => LinkRepository) {
  describe('findAll', () => {
    it('filters by Band', () => {
      const repository = createRepository();

      const fiveGig = repository.create(
        draft({ name: 'Five Gig Link', band: '5GHz' }),
      );
      repository.create(draft({ name: 'Eleven Gig Link', band: '11GHz' }));
      if (!fiveGig.ok) throw new Error('expected create to succeed');

      const found = repository.findAll({ band: '5GHz' });

      expect(found.map((link) => link.id)).toEqual([fiveGig.link.id]);
    });

    it('filters by q across name, siteA and siteB', () => {
      const repository = createRepository();

      const match = repository.create(
        draft({ name: 'Depot Link', siteA: 'Depot', siteB: 'Ridge' }),
      );
      repository.create(
        draft({ name: 'Warehouse Link', siteA: 'Warehouse', siteB: 'Yard' }),
      );
      if (!match.ok) throw new Error('expected create to succeed');

      const found = repository.findAll({ q: 'depot' });

      expect(found.map((link) => link.id)).toEqual([match.link.id]);
    });
  });
}

/** One Link, already created, since every update case starts from one. */
function seedOne(createRepository: () => LinkRepository) {
  const repository = createRepository();
  const created = repository.create(draft());
  if (!created.ok) throw new Error('expected create to succeed');

  return { repository, link: created.link };
}

function updateVersionContract(createRepository: () => LinkRepository) {
  describe('the compare-and-swap', () => {
    it('applies the patch at the matching version and hands back the next version', () => {
      const { repository, link } = seedOne(createRepository);

      const result = repository.update(
        link.id,
        { txPowerDbm: 25 },
        link.version,
      );

      expect(result).toEqual({
        ok: true,
        link: expect.objectContaining({
          id: link.id,
          txPowerDbm: 25,
          version: link.version + 1,
        }),
      });
    });

    it('refuses a stale version and hands back the whole current Link, not just its version', () => {
      const { repository, link } = seedOne(createRepository);
      const first = repository.update(
        link.id,
        { txPowerDbm: 25 },
        link.version,
      );
      if (!first.ok) throw new Error('expected the first update to succeed');

      let second: UpdateLinkResult | undefined;
      expect(() => {
        second = repository.update(link.id, { txPowerDbm: 30 }, link.version);
      }).not.toThrow();

      expect(second).toEqual({
        ok: false,
        reason: 'version-conflict',
        current: first.link,
      });
    });

    it('reports an unknown id as a result rather than throwing', () => {
      const repository = createRepository();

      let result: UpdateLinkResult | undefined;
      expect(() => {
        result = repository.update(toLinkId('lnk_9999'), { txPowerDbm: 25 }, 1);
      }).not.toThrow();

      expect(result).toEqual({ ok: false, reason: 'not-found' });
    });
  });
}

function updateNameContract(createRepository: () => LinkRepository) {
  describe('renaming', () => {
    it('refuses a rename onto a name another Link already holds', () => {
      const { repository } = seedOne(createRepository);
      const other = repository.create(
        draft({ name: 'Depot to Warehouse', siteA: 'Depot' }),
      );
      if (!other.ok) throw new Error('expected create to succeed');

      const result = repository.update(
        other.link.id,
        { name: 'North Ridge to Depot' },
        other.link.version,
      );

      expect(result).toEqual({
        ok: false,
        reason: 'name-taken',
        name: 'North Ridge to Depot',
      });
      expect(repository.findById(other.link.id)).toEqual(other.link);
    });

    it('allows a Link to keep its own name, since that is not a collision', () => {
      const { repository, link } = seedOne(createRepository);

      const result = repository.update(
        link.id,
        { name: link.name, txPowerDbm: 25 },
        link.version,
      );

      expect(result.ok).toBe(true);
    });
  });
}

function updateRecordContract(createRepository: () => LinkRepository) {
  describe('what an edit may not disturb', () => {
    it('returns a Link that is not the stored instance', () => {
      const { repository, link } = seedOne(createRepository);

      const result = repository.update(
        link.id,
        { txPowerDbm: 25 },
        link.version,
      );
      if (!result.ok) throw new Error('expected update to succeed');
      result.link.name = 'Corrupted';

      expect(repository.findById(link.id)?.name).toBe('North Ridge to Depot');
    });

    it('never moves createdAt', () => {
      const { repository, link } = seedOne(createRepository);

      const result = repository.update(
        link.id,
        { txPowerDbm: 25 },
        link.version,
      );
      if (!result.ok) throw new Error('expected update to succeed');

      expect(result.link.createdAt).toBe(link.createdAt);
    });
  });
}

function updateContract(createRepository: () => LinkRepository) {
  describe('update', () => {
    updateVersionContract(createRepository);
    updateNameContract(createRepository);
    updateRecordContract(createRepository);
  });
}

function deleteContract(createRepository: () => LinkRepository) {
  describe('delete', () => {
    it('returns true the first time and false the second', () => {
      const { repository, link } = seedOne(createRepository);

      expect(repository.delete(link.id)).toBe(true);
      expect(repository.delete(link.id)).toBe(false);
    });

    it('removes the Link from findAll and drops the count', () => {
      const { repository, link } = seedOne(createRepository);

      repository.delete(link.id);

      expect(repository.findById(link.id)).toBeUndefined();
      expect(repository.count()).toBe(0);
    });

    it('reports an unknown id as false rather than throwing', () => {
      const repository = createRepository();

      let result: boolean | undefined;
      expect(() => {
        result = repository.delete(toLinkId('lnk_9999'));
      }).not.toThrow();

      expect(result).toBe(false);
    });
  });
}

/**
 * A reusable contract suite, bound to a factory rather than a class. ADR-0008
 * claims that swapping in a real store touches one file — a suite bound to
 * InMemoryLinkRepository could not verify that claim, and one taking a
 * factory can be pointed at the replacement unchanged.
 */
export function runLinkRepositoryContract(
  createRepository: () => LinkRepository,
) {
  describe('LinkRepository contract', () => {
    createContract(createRepository);
    findAllContract(createRepository);
    updateContract(createRepository);
    deleteContract(createRepository);
  });
}
