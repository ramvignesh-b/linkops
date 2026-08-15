import { createSeededLinkRepository } from './seed-links';

describe('createSeededLinkRepository', () => {
  it('seeds ten Links on boot', () => {
    const repository = createSeededLinkRepository();

    expect(repository.count()).toBe(10);
  });

  it('produces the same fleet across two boots', () => {
    const names = (repository: ReturnType<typeof createSeededLinkRepository>) =>
      repository
        .findAll()
        .map((link) => link.name)
        .sort();

    expect(names(createSeededLinkRepository())).toEqual(
      names(createSeededLinkRepository()),
    );
  });

  it('assigns the same ids across two boots, since each repository owns its own id sequence', () => {
    const ids = (repository: ReturnType<typeof createSeededLinkRepository>) =>
      repository
        .findAll()
        .map((link) => link.id)
        .sort();

    expect(ids(createSeededLinkRepository())).toEqual(
      ids(createSeededLinkRepository()),
    );
  });
});
