import { fleetSummarySchema } from './fleet-summary';

const validSummary = {
  total: 10,
  up: 4,
  degraded: 2,
  down: 4,
  totalThroughputMbps: 812,
  worstLinkId: 'lnk_0007',
};

describe('fleetSummarySchema', () => {
  it('accepts the aggregate counts and totals across the Fleet', () => {
    expect(fleetSummarySchema.safeParse(validSummary).success).toBe(true);
  });

  it('accepts a null worstLinkId, for a Fleet where nothing has reported', () => {
    const result = fleetSummarySchema.safeParse({
      ...validSummary,
      worstLinkId: null,
    });

    expect(result.success).toBe(true);
  });

  it('rejects a negative count', () => {
    const result = fleetSummarySchema.safeParse({ ...validSummary, down: -1 });

    expect(result.success).toBe(false);
  });
});
