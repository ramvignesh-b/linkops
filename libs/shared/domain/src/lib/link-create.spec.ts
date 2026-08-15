import { linkCreateSchema } from './link-create';

const validCreate = {
  name: 'North Ridge to Depot',
  siteA: 'North Ridge',
  siteB: 'Depot',
  band: '5GHz',
  mode: 'PtP',
  capacityMbps: 300,
  txPowerDbm: 20,
  channelWidthMhz: 40,
};

describe('linkCreateSchema', () => {
  it('accepts the eight operator-editable fields', () => {
    expect(linkCreateSchema.safeParse(validCreate).success).toBe(true);
  });

  it('rejects a capacityMbps below the documented range, naming the field', () => {
    const result = linkCreateSchema.safeParse({
      ...validCreate,
      capacityMbps: 9,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['capacityMbps']);
  });

  it('drops a status field even if present on the input, since status is never client-writable', () => {
    const parsed = linkCreateSchema.parse({
      ...validCreate,
      status: { status: 'up' },
    });

    expect(parsed).not.toHaveProperty('status');
  });

  it('drops a version field even if present on the input', () => {
    const parsed = linkCreateSchema.parse({ ...validCreate, version: 7 });

    expect(parsed).not.toHaveProperty('version');
  });
});
