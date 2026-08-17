import { systemClock } from '@linkops/server/telemetry';
import {
  fakeLinkRepository as repository,
  fakeTelemetryPort as telemetry,
} from './agent-test-doubles.fixture';
import { StubTriageAgent } from './stub-triage-agent';

/**
 * Verifies the `StubTriageAgent` async seam. The agent is wrapped in a Promise
 * while its deterministic behaviour remains unchanged. `server-a2ui-agent.module.spec.ts`
 * exercises the deterministic reply itself through the HTTP surface; this
 * only has to prove the async seam — that `respond` really does
 * hand back a Promise, not a value supertest happens to await regardless.
 */
describe('StubTriageAgent — the async seam', () => {
  it('returns a Promise from respond, rather than the envelope itself', () => {
    const agent = new StubTriageAgent(repository, telemetry, systemClock);

    const result = agent.respond({ kind: 'open' });

    expect(result).toBeInstanceOf(Promise);
  });

  it('resolves to the same envelope the stub always answered with', async () => {
    const agent = new StubTriageAgent(repository, telemetry, systemClock);

    const envelope = await agent.respond({ kind: 'open' });

    expect(envelope).toEqual({
      version: 'v1.0',
      createSurface: expect.objectContaining({ surfaceId: 'triage' }),
    });
  });
});
