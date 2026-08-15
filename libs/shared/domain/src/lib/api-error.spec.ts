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
