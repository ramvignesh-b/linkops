import { toLinkId, type TelemetrySample } from '@linkops/shared/domain';
import { selectWorstLinkId } from './select-worst-link-id';

function sample(linkId: string, snrDb: number): TelemetrySample {
  return {
    linkId: toLinkId(linkId),
    ts: '2026-08-15T09:00:00.000Z',
    rssiDbm: -50,
    snrDb,
    throughputMbps: 100,
  };
}

describe('selectWorstLinkId', () => {
  it('returns null when the fleet has no Sample at all', () => {
    expect(selectWorstLinkId(new Map())).toBeNull();
  });

  it('picks the lowest snrDb among Links that have a Sample', () => {
    const samples = new Map([
      [toLinkId('lnk_0001'), sample('lnk_0001', 20)],
      [toLinkId('lnk_0002'), sample('lnk_0002', 5)],
      [toLinkId('lnk_0003'), sample('lnk_0003', 12)],
    ]);

    expect(selectWorstLinkId(samples)).toBe('lnk_0002');
  });

  it('breaks a tied lowest snrDb on the lowest id', () => {
    const samples = new Map([
      [toLinkId('lnk_0003'), sample('lnk_0003', 8)],
      [toLinkId('lnk_0001'), sample('lnk_0001', 8)],
      [toLinkId('lnk_0002'), sample('lnk_0002', 8)],
    ]);

    expect(selectWorstLinkId(samples)).toBe('lnk_0001');
  });

  it('excludes Links with no Sample entirely, rather than treating them as worst', () => {
    // A no-Sample Link never appears in the map at all — this asserts the
    // selection never needs to reason about "no Sample" as a case of its own.
    const samples = new Map([[toLinkId('lnk_0001'), sample('lnk_0001', 3)]]);

    expect(selectWorstLinkId(samples)).toBe('lnk_0001');
  });
});
