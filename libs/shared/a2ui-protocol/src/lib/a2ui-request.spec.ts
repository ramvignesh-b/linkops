import { a2uiRequestSchema } from './a2ui-request';

describe('a2uiRequestSchema', () => {
  it('accepts opening a conversation', () => {
    expect(a2uiRequestSchema.safeParse({ kind: 'open' }).success).toBe(true);
  });

  it('accepts an Action naming the Surface, the component, the event and the Data Model values it carries', () => {
    const result = a2uiRequestSchema.safeParse({
      kind: 'act',
      surfaceId: 'triage',
      componentId: 'recommend',
      event: 'recommend',
      data: { linkId: 'lnk_0001', remediation: 'narrow-channel' },
    });

    expect(result.success).toBe(true);
  });

  it.each([
    [
      'the Surface it came from',
      { componentId: 'recommend', event: 'recommend', data: {} },
    ],
    [
      'the component that raised it',
      { surfaceId: 'triage', event: 'recommend', data: {} },
    ],
    [
      'the event name',
      { surfaceId: 'triage', componentId: 'recommend', data: {} },
    ],
    [
      'the Data Model values it carries',
      { surfaceId: 'triage', componentId: 'recommend', event: 'recommend' },
    ],
  ])('refuses an Action missing %s', (_label, partial) => {
    const result = a2uiRequestSchema.safeParse({ kind: 'act', ...partial });

    expect(result.success).toBe(false);
  });

  it('refuses an unrecognised kind', () => {
    expect(a2uiRequestSchema.safeParse({ kind: 'nonsense' }).success).toBe(
      false,
    );
  });

  it('refuses a request carrying fields no member of the union declares', () => {
    const result = a2uiRequestSchema.safeParse({
      kind: 'open',
      surfaceId: 'triage',
    });

    expect(result.success).toBe(false);
  });
});
