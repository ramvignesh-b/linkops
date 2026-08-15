import { telemetrySampleSchema } from './telemetry-sample';

const validSample = {
  linkId: 'lnk_0001',
  ts: '2026-08-15T09:00:01.000Z',
  rssiDbm: -62,
  snrDb: 21,
  throughputMbps: 184,
};

describe('telemetrySampleSchema', () => {
  it('accepts a reading for one Link at one instant', () => {
    expect(telemetrySampleSchema.safeParse(validSample).success).toBe(true);
  });

  it('rejects a Sample with no Link to attribute it to', () => {
    const { linkId: _linkId, ...orphan } = validSample;

    expect(telemetrySampleSchema.safeParse(orphan).success).toBe(false);
  });

  it('rejects a timestamp that is not an instant', () => {
    const result = telemetrySampleSchema.safeParse({
      ...validSample,
      ts: 'just now',
    });

    expect(result.success).toBe(false);
  });

  it('rejects a positive RSSI, since RSSI is always negative', () => {
    const result = telemetrySampleSchema.safeParse({
      ...validSample,
      rssiDbm: 12,
    });

    expect(result.success).toBe(false);
  });
});
