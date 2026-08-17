import { toLinkId, type Link, type LinkStatus } from '@linkops/shared/domain';
import type { TelemetryPort } from '@linkops/server/telemetry';
import {
  fakeLinkRepository,
  fakeTelemetryPort,
  recordWith,
  sampleFor,
} from './agent-test-doubles.fixture';
import { needsAttention, linksNeedingAttention } from './needs-attention';

/** A Link, complete enough for `needsAttention` to read, at a given Status. */
function linkWith(status: LinkStatus): Link {
  return {
    id: toLinkId('lnk_1'),
    name: 'Test Link',
    siteA: 'A',
    siteB: 'B',
    band: '5GHz',
    mode: 'PtP',
    capacityMbps: 100,
    txPowerDbm: 10,
    channelWidthMhz: 20,
    status,
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('needsAttention', () => {
  it('is true for a degraded Link', () => {
    expect(needsAttention(linkWith({ status: 'degraded' }))).toBe(true);
  });

  it('is true for a Link down for poor metrics', () => {
    expect(
      needsAttention(linkWith({ status: 'down', reason: 'metrics' })),
    ).toBe(true);
  });

  it('is false for a Link down for want of data — that is a Link to go and look at', () => {
    expect(needsAttention(linkWith({ status: 'down', reason: 'stale' }))).toBe(
      false,
    );
  });

  it('is false for a healthy Link', () => {
    expect(needsAttention(linkWith({ status: 'up' }))).toBe(false);
  });
});

describe('linksNeedingAttention', () => {
  it('derives Status through the shared presenter and offers only the Links that need attention, in Roster order', () => {
    const now = new Date('2026-01-01T00:00:05.000Z');
    const [healthy, degraded, bad, stale] = [
      recordWith('lnk_healthy', 'Healthy'),
      recordWith('lnk_degraded', 'Degraded'),
      recordWith('lnk_bad', 'Bad'),
      recordWith('lnk_stale', 'Stale'),
    ];
    const repository = {
      ...fakeLinkRepository,
      findAll: () => [healthy, degraded, bad, stale],
    };
    const telemetry: TelemetryPort = {
      ...fakeTelemetryPort,
      latestSample: (id) => {
        if (id === healthy.id) return sampleFor(id, 'healthy');
        if (id === degraded.id) return sampleFor(id, 'degraded');
        if (id === bad.id) return sampleFor(id, 'bad');
        // `stale` reports nothing — down for want of data, not for metrics.
        return null;
      },
    };

    const links = linksNeedingAttention(repository, telemetry, now);

    expect(links.map((link) => link.name)).toEqual(['Degraded', 'Bad']);
  });
});
