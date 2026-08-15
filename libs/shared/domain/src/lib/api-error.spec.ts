import { apiErrorBodySchema, apiErrorEnvelopeSchema } from './api-error';
import type { ApiErrorCode } from './api-error';

/**
 * Proof that `ApiErrorCode` is closed and a switch over it is
 * exhaustive-checkable by the compiler: removing a case below, or adding a
 * code to the union without a case here, fails `tsc`.
 */
function describeCode(code: ApiErrorCode): string {
  switch (code) {
    case 'LINK_NOT_FOUND':
      return 'the requested Link does not exist';
    case 'LINK_VERSION_CONFLICT':
      return 'someone else already changed this Link';
    case 'LINK_NAME_TAKEN':
      return 'that name is already in use';
    case 'VALIDATION_FAILED':
      return 'the submitted configuration failed validation';
    case 'A2UI_INVALID_PAYLOAD':
      return 'the assistant sent a payload the renderer will not accept';
    default: {
      const exhaustive: never = code;
      return exhaustive;
    }
  }
}

describe('ApiErrorCode', () => {
  it('has exactly the five codes ticket 12 fixes', () => {
    const codes: ApiErrorCode[] = [
      'LINK_NOT_FOUND',
      'LINK_VERSION_CONFLICT',
      'LINK_NAME_TAKEN',
      'VALIDATION_FAILED',
      'A2UI_INVALID_PAYLOAD',
    ];

    expect(codes.map(describeCode)).toEqual([
      'the requested Link does not exist',
      'someone else already changed this Link',
      'that name is already in use',
      'the submitted configuration failed validation',
      'the assistant sent a payload the renderer will not accept',
    ]);
  });
});

const currentLink = {
  id: 'lnk_0001',
  name: 'North Ridge to Depot',
  siteA: 'North Ridge',
  siteB: 'Depot',
  band: '5GHz',
  mode: 'PtP',
  capacityMbps: 300,
  txPowerDbm: 20,
  channelWidthMhz: 40,
  status: { status: 'down', reason: 'stale' },
  version: 2,
  createdAt: '2026-08-15T09:00:00.000Z',
  updatedAt: '2026-08-15T09:04:00.000Z',
};

describe('apiErrorBodySchema', () => {
  it('parses a LINK_NOT_FOUND body', () => {
    const result = apiErrorBodySchema.safeParse({
      code: 'LINK_NOT_FOUND',
      message: 'Link lnk_9999 not found',
      details: { id: 'lnk_9999' },
    });

    expect(result.success).toBe(true);
  });

  it('parses a LINK_VERSION_CONFLICT body carrying the whole current Link in details', () => {
    const result = apiErrorBodySchema.safeParse({
      code: 'LINK_VERSION_CONFLICT',
      message: 'Link lnk_0001 has moved on to version 2 since it was read',
      details: { currentVersion: 2, current: currentLink },
    });

    expect(result.success).toBe(true);
  });

  it('rejects a code outside the closed union', () => {
    const result = apiErrorBodySchema.safeParse({
      code: 'SOMETHING_ELSE',
      message: 'nope',
      details: {},
    });

    expect(result.success).toBe(false);
  });

  it('documents message as diagnostic, not operator-facing, on every arm', () => {
    for (const arm of apiErrorBodySchema.options) {
      expect(arm.shape.message.description).toMatch(/diagnostic/i);
    }
  });
});

describe('apiErrorEnvelopeSchema', () => {
  it('parses the one envelope shape every failure wears', () => {
    const result = apiErrorEnvelopeSchema.safeParse({
      error: {
        code: 'LINK_NAME_TAKEN',
        message: 'that name is already in use',
        details: { name: 'Depot to Warehouse' },
      },
    });

    expect(result.success).toBe(true);
  });
});
