import { linkPatchSchema } from './link-patch';

describe('linkPatchSchema', () => {
  it('rejects a payload with no version, so optimistic concurrency is not a controller check', () => {
    const result = linkPatchSchema.safeParse({ name: 'Renamed Link' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['version']);
  });

  it('accepts a version and a single field, since an operator edits what they changed', () => {
    const parsed = linkPatchSchema.parse({ version: 3, txPowerDbm: 22 });

    expect(parsed).toEqual({ version: 3, txPowerDbm: 22 });
  });

  it('drops a status field even if present on the input, since status is never client-writable', () => {
    const parsed = linkPatchSchema.parse({
      version: 3,
      status: { status: 'up' },
    });

    expect(parsed).not.toHaveProperty('status');
  });
});
