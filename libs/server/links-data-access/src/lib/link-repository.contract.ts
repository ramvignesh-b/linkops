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
    it('creates a Link and finds it by id', () => {
      const repository = createRepository();

      const created = repository.create(draft());
      const found = repository.findById(created.id);

      expect(found).toEqual(created);
    });

    it('returns a Link that is not the stored instance', () => {
      const repository = createRepository();

      const created = repository.create(draft());
      created.name = 'Corrupted';

      expect(repository.findById(created.id)?.name).toBe(
        'North Ridge to Depot',
      );
    });

    it('counts the Links created so far', () => {
      const repository = createRepository();

      expect(repository.count()).toBe(0);

      repository.create(draft({ name: 'First Link' }));
      repository.create(draft({ name: 'Second Link' }));

      expect(repository.count()).toBe(2);
    });

    it('findAll filters by Band', () => {
      const repository = createRepository();

      const fiveGig = repository.create(
        draft({ name: 'Five Gig Link', band: '5GHz' }),
      );
      repository.create(draft({ name: 'Eleven Gig Link', band: '11GHz' }));

      const found = repository.findAll({ band: '5GHz' });

      expect(found.map((link) => link.id)).toEqual([fiveGig.id]);
    });

    it('findAll filters by q across name, siteA and siteB', () => {
      const repository = createRepository();

      const match = repository.create(
        draft({ name: 'Depot Link', siteA: 'Depot', siteB: 'Ridge' }),
      );
      repository.create(
        draft({ name: 'Warehouse Link', siteA: 'Warehouse', siteB: 'Yard' }),
      );

      const found = repository.findAll({ q: 'depot' });

      expect(found.map((link) => link.id)).toEqual([match.id]);
    });
  });
}
