import { linkIdSchema, toLinkId } from './ids';

describe('linkIdSchema', () => {
  it('rejects an empty string, because a Link id is never blank', () => {
    const result = linkIdSchema.safeParse('');

    expect(result.success).toBe(false);
  });
});

describe('toLinkId', () => {
  it('turns a non-empty string into a LinkId', () => {
    expect(toLinkId('lnk_0001')).toBe('lnk_0001');
  });
});
