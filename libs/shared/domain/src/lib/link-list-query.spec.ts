import { linkListQuerySchema } from './link-list-query';

describe('linkListQuerySchema', () => {
  it('defaults sort to name and dir to asc when both are absent', () => {
    const parsed = linkListQuerySchema.parse({});

    expect(parsed).toEqual({ sort: 'name', dir: 'asc' });
  });

  it('leaves status, band and q undefined when absent, rather than inventing a value', () => {
    const parsed = linkListQuerySchema.parse({});

    expect(parsed.status).toBeUndefined();
    expect(parsed.band).toBeUndefined();
    expect(parsed.q).toBeUndefined();
  });

  it.each(['up', 'degraded', 'down'])('accepts a status of %s', (status) => {
    const result = linkListQuerySchema.safeParse({ status });

    expect(result.success).toBe(true);
  });

  it('rejects a status outside up, degraded or down', () => {
    const result = linkListQuerySchema.safeParse({ status: 'sideways' });

    expect(result.success).toBe(false);
  });

  it.each(['5GHz', '5.8GHz', '11GHz', '24GHz'])(
    'accepts the Band %s',
    (band) => {
      const result = linkListQuerySchema.safeParse({ band });

      expect(result.success).toBe(true);
    },
  );

  it('rejects a Band outside the four the radios support', () => {
    const result = linkListQuerySchema.safeParse({ band: '60GHz' });

    expect(result.success).toBe(false);
  });

  it('accepts any string for q, since it is free text', () => {
    const result = linkListQuerySchema.safeParse({ q: 'depot' });

    expect(result.success).toBe(true);
  });

  it.each(['name', 'capacityMbps', 'status', 'throughputMbps'])(
    'accepts a sort key of %s',
    (sort) => {
      const result = linkListQuerySchema.safeParse({ sort });

      expect(result.success).toBe(true);
    },
  );

  it('rejects a sort key the API does not support', () => {
    const result = linkListQuerySchema.safeParse({ sort: 'siteA' });

    expect(result.success).toBe(false);
  });

  it.each(['asc', 'desc'])('accepts a dir of %s', (dir) => {
    const result = linkListQuerySchema.safeParse({ dir });

    expect(result.success).toBe(true);
  });

  it('rejects a dir that is neither asc nor desc', () => {
    const result = linkListQuerySchema.safeParse({ dir: 'ascending' });

    expect(result.success).toBe(false);
  });
});
