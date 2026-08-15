import type { LinkDraft, LinkRepository } from './link-repository';

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
  });
}
