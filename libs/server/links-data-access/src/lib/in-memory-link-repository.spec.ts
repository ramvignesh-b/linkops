import { InMemoryLinkRepository } from './in-memory-link-repository';
import { runLinkRepositoryContract } from './link-repository.contract';

runLinkRepositoryContract(() => new InMemoryLinkRepository());
