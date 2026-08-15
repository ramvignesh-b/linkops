import { linkSchema } from './link';

const validLink = {
  id: 'lnk_0001',
  name: 'North Ridge to Depot',
  siteA: 'North Ridge',
  siteB: 'Depot',
  band: '5GHz',
  mode: 'PtP',
  capacityMbps: 300,
  txPowerDbm: 20,
  channelWidthMhz: 40,
  status: { status: 'up' },
  version: 1,
  createdAt: '2026-08-15T09:00:00.000Z',
  updatedAt: '2026-08-15T09:00:00.000Z',
};

describe('linkSchema', () => {
  it('accepts a fully populated Link', () => {
    expect(linkSchema.safeParse(validLink).success).toBe(true);
  });

  it('rejects a name shorter than 3 characters', () => {
    const result = linkSchema.safeParse({ ...validLink, name: 'ab' });

    expect(result.success).toBe(false);
  });

  it('rejects a name longer than 40 characters', () => {
    const result = linkSchema.safeParse({ ...validLink, name: 'a'.repeat(41) });

    expect(result.success).toBe(false);
  });

  it('rejects a capacityMbps below 10', () => {
    const result = linkSchema.safeParse({ ...validLink, capacityMbps: 9 });

    expect(result.success).toBe(false);
  });

  it('rejects a capacityMbps above 1000', () => {
    const result = linkSchema.safeParse({ ...validLink, capacityMbps: 1001 });

    expect(result.success).toBe(false);
  });

  it('rejects a txPowerDbm below -10', () => {
    const result = linkSchema.safeParse({ ...validLink, txPowerDbm: -11 });

    expect(result.success).toBe(false);
  });

  it('rejects a txPowerDbm above 30', () => {
    const result = linkSchema.safeParse({ ...validLink, txPowerDbm: 31 });

    expect(result.success).toBe(false);
  });

  it('rejects a channelWidthMhz outside 20, 40 or 80', () => {
    const result = linkSchema.safeParse({ ...validLink, channelWidthMhz: 60 });

    expect(result.success).toBe(false);
  });

  it.each([20, 40, 80])(
    'accepts a channelWidthMhz of %i',
    (channelWidthMhz) => {
      const result = linkSchema.safeParse({ ...validLink, channelWidthMhz });

      expect(result.success).toBe(true);
    },
  );

  it('rejects a Band outside the four the radios support', () => {
    const result = linkSchema.safeParse({ ...validLink, band: '60GHz' });

    expect(result.success).toBe(false);
  });

  it.each(['5GHz', '5.8GHz', '11GHz', '24GHz'])(
    'accepts the Band %s',
    (band) => {
      const result = linkSchema.safeParse({ ...validLink, band });

      expect(result.success).toBe(true);
    },
  );

  it('rejects a Mode that is not one of the three topologies', () => {
    const result = linkSchema.safeParse({ ...validLink, mode: 'Mesh' });

    expect(result.success).toBe(false);
  });

  it.each(['PtP', 'PtMP', 'S2S'])('accepts the Mode %s', (mode) => {
    const result = linkSchema.safeParse({ ...validLink, mode });

    expect(result.success).toBe(true);
  });

  it('rejects a down Status with no reason', () => {
    const result = linkSchema.safeParse({
      ...validLink,
      status: { status: 'down' },
    });

    expect(result.success).toBe(false);
  });

  it('rejects a reason riding along on an up Status', () => {
    const result = linkSchema.safeParse({
      ...validLink,
      status: { status: 'up', reason: 'stale' },
    });

    expect(result.success).toBe(false);
  });

  it('rejects an empty id', () => {
    const result = linkSchema.safeParse({ ...validLink, id: '' });

    expect(result.success).toBe(false);
  });

  it('rejects a createdAt that is not an ISO datetime', () => {
    const result = linkSchema.safeParse({
      ...validLink,
      createdAt: 'yesterday',
    });

    expect(result.success).toBe(false);
  });

  it('rejects a version below 1, since versions start at 1', () => {
    const result = linkSchema.safeParse({ ...validLink, version: 0 });

    expect(result.success).toBe(false);
  });
});
