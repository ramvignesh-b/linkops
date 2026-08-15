import { Module } from '@nestjs/common';
import { createSeededLinkRepository } from './seed-links';
import { LINK_REPOSITORY } from './link-repository.token';

/**
 * The Roster, provided by the library that owns it rather than by whichever
 * feature happened to need it first. Every consumer — the links API, the
 * telemetry Simulator, the stream — imports this module and shares the one
 * repository instance, which is what makes "the fleet" a single fleet.
 */
@Module({
  providers: [
    { provide: LINK_REPOSITORY, useFactory: createSeededLinkRepository },
  ],
  exports: [LINK_REPOSITORY],
})
export class ServerLinksDataAccessModule {}
