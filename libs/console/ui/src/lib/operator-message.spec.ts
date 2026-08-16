import { operatorMessageFor } from './operator-message';

describe('operatorMessageFor', () => {
  it('gives every code its own non-empty, sentence-shaped copy', () => {
    const codes = [
      'LINK_NOT_FOUND',
      'LINK_VERSION_CONFLICT',
      'LINK_NAME_TAKEN',
      'VALIDATION_FAILED',
      'A2UI_INVALID_PAYLOAD',
    ] as const;

    const messages = codes.map(operatorMessageFor);

    for (const message of messages) {
      expect(message.length).toBeGreaterThan(0);
    }
    // Distinct per code — an operator reading two different failures should
    // never see the same words for both.
    expect(new Set(messages).size).toBe(codes.length);
  });

  it('never echoes the Server-formatted name-conflict wording verbatim', () => {
    // The Server's own `LinkNameTakenError` message interpolates the name in
    // quotes; operator copy is written independently of it.
    expect(operatorMessageFor('LINK_NAME_TAKEN')).not.toMatch(/"/);
  });
});
