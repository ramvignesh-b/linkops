import {
  a2uiEnvelopeSchema,
  type A2uiCreateSurface,
} from '@linkops/shared/a2ui-protocol';
import type { Clock } from '@linkops/server/telemetry';
import {
  fakeLinkRepository,
  fakeTelemetryPort,
  recordWith,
  sampleFor,
} from './agent-test-doubles.fixture';
import { GEMINI_TRIAGE_JSON_SCHEMA } from './gemini-triage-schema';
import { quietSurface } from './triage-surface';

const { generateContent, GoogleGenAIMock } = vi.hoisted(() => {
  const generateContent = vi.fn();
  const GoogleGenAIMock = vi.fn().mockImplementation(function () {
    return { models: { generateContent } };
  });
  return { generateContent, GoogleGenAIMock };
});

vi.mock('@google/genai', () => ({ GoogleGenAI: GoogleGenAIMock }));

const { GeminiAgent } = await import('./gemini-agent');

const fixedClock: Clock = { now: () => new Date('2026-01-01T00:00:05.000Z') };

/** What the model answers with, when it answers well. */
const triageReply = {
  intro: '2 Links are running hot on interference.',
  linkId: 'lnk_degraded',
  remediation: 'raise-tx-power',
  rationale: 'Its SNR sits 6 dB below the healthy floor.',
};

function mockGeminiReply(body: unknown): void {
  generateContent.mockResolvedValueOnce({ text: JSON.stringify(body) });
}

beforeEach(() => {
  generateContent.mockReset();
  GoogleGenAIMock.mockClear();
});

const degraded = recordWith('lnk_degraded', 'Degraded Link');
const other = recordWith('lnk_other', 'Other Link');
const degradedRepository = {
  ...fakeLinkRepository,
  findAll: () => [degraded, other],
};
const degradedTelemetry = {
  ...fakeTelemetryPort,
  latestSample: (id: string) => sampleFor(id, 'degraded'),
};

function agentWith(
  repository = degradedRepository,
  telemetry = degradedTelemetry,
) {
  return new GeminiAgent(repository, telemetry, fixedClock, 'sk-test-key');
}

/** The Surface out of a reply, refusing to read one that is not valid A2UI. */
function surfaceOf(envelope: unknown): A2uiCreateSurface {
  const parsed = a2uiEnvelopeSchema.parse(envelope);
  if (!('createSurface' in parsed) || parsed.createSurface === undefined) {
    throw new Error('the reply carried no Surface');
  }

  return parsed.createSurface;
}

const componentById = (surface: A2uiCreateSurface, id: string) =>
  surface.components.find((one) => one.id === id);

describe('GeminiAgent — what it asks the model for', () => {
  it('constructs the client with the given API key', async () => {
    mockGeminiReply(triageReply);

    await agentWith().respond({ kind: 'open' });

    expect(GoogleGenAIMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'sk-test-key' }),
    );
  });

  it('uses the configured model name', async () => {
    mockGeminiReply(triageReply);
    const agent = new GeminiAgent(
      degradedRepository,
      degradedTelemetry,
      fixedClock,
      'sk-test-key',
      'gemini-3.6-flash',
    );

    await agent.respond({ kind: 'open' });

    expect(generateContent).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-3.6-flash' }),
    );
  });

  it('asks for a judgement, not an A2UI document — the flat triage schema', async () => {
    mockGeminiReply(triageReply);

    await agentWith().respond({ kind: 'open' });

    const [call] = generateContent.mock.calls[0] as [
      { config?: { responseMimeType?: string; responseJsonSchema?: unknown } },
    ];
    expect(call.config?.responseMimeType).toBe('application/json');
    expect(call.config?.responseJsonSchema).toEqual(GEMINI_TRIAGE_JSON_SCHEMA);
  });

  it('never mentions A2UI or a component type to the model — the console owns the layout', async () => {
    mockGeminiReply(triageReply);

    await agentWith().respond({ kind: 'open' });

    const [call] = generateContent.mock.calls[0] as [
      { contents: string; config?: { systemInstruction?: string } },
    ];
    const instruction = call.config?.systemInstruction ?? '';
    expect(instruction).not.toContain('A2UI');
    for (const component of ['Surface', 'Card', 'Select', 'Metric']) {
      expect(instruction).not.toContain(component);
    }
  });

  it('sends the system instructions apart from the Fleet data', async () => {
    mockGeminiReply(triageReply);

    await agentWith().respond({ kind: 'open' });

    const [call] = generateContent.mock.calls[0] as [
      { contents: string; config?: { systemInstruction?: string } },
    ];
    expect(call.config?.systemInstruction).toContain('triage helper');
    expect(call.contents).not.toContain('triage helper');
    expect(call.contents).toContain('Degraded Link');
  });

  it('passes only the Links needing attention, never a healthy one', async () => {
    mockGeminiReply(triageReply);
    const healthy = recordWith('lnk_healthy', 'Healthy Link');
    const repository = {
      ...fakeLinkRepository,
      findAll: () => [healthy, degraded],
    };
    const telemetry = {
      ...fakeTelemetryPort,
      latestSample: (id: string) =>
        sampleFor(id, id === healthy.id ? 'healthy' : 'degraded'),
    };

    await agentWith(repository, telemetry).respond({ kind: 'open' });

    const [call] = generateContent.mock.calls[0] as [{ contents: string }];
    expect(call.contents).toContain('Degraded Link');
    expect(call.contents).not.toContain('Healthy Link');
  });
});

describe('GeminiAgent — the Surface it builds', () => {
  it('answers a Surface whose Text, Selects and Button all carry their content', async () => {
    mockGeminiReply(triageReply);

    const surface = surfaceOf(await agentWith().respond({ kind: 'open' }));

    // The bug this design exists to make impossible: a schema-valid Surface
    // that renders blank because a component came back without its content.
    expect(componentById(surface, 'intro')?.['text']).toBe(triageReply.intro);
    expect(componentById(surface, 'link')?.['options']).toHaveLength(2);
    expect(componentById(surface, 'remediation')?.['options']).not.toHaveLength(
      0,
    );
    expect(componentById(surface, 'recommend')?.['label']).toEqual(
      expect.any(String),
    );
  });

  it('starts the pickers on the Link and Remediation the model recommends', async () => {
    mockGeminiReply(triageReply);

    const surface = surfaceOf(await agentWith().respond({ kind: 'open' }));

    expect(surface.dataModel).toEqual({
      linkId: 'lnk_degraded',
      remediation: 'raise-tx-power',
    });
  });

  it('falls back to the first Link and Remediation when the model names ones the Fleet does not have', async () => {
    mockGeminiReply({
      ...triageReply,
      linkId: 'lnk_9999',
      remediation: 'teleport-the-mast',
    });

    const surface = surfaceOf(await agentWith().respond({ kind: 'open' }));

    // A bad recommendation costs a worse starting point, never a broken panel.
    expect(surface.dataModel).toEqual({
      linkId: 'lnk_degraded',
      remediation: 'narrow-channel',
    });
  });

  it('rejects a model reply that is not the triage shape at all', async () => {
    mockGeminiReply({ nonsense: true });

    await expect(agentWith().respond({ kind: 'open' })).rejects.toThrow();
  });
});

describe('GeminiAgent — the quiet Surface, answered without the model', () => {
  it('answers quietSurface() directly for a Fleet with nothing degraded', async () => {
    const healthy = recordWith('lnk_healthy', 'Healthy Link');
    const repository = { ...fakeLinkRepository, findAll: () => [healthy] };
    const telemetry = {
      ...fakeTelemetryPort,
      latestSample: () => sampleFor(healthy.id, 'healthy'),
    };

    const envelope = await agentWith(repository, telemetry).respond({
      kind: 'open',
    });

    expect(generateContent).not.toHaveBeenCalled();
    expect(envelope).toEqual({
      version: 'v1.0',
      createSurface: quietSurface(),
    });
  });
});

describe('GeminiAgent — the Action round trip', () => {
  const action = {
    kind: 'act',
    surfaceId: 'triage',
    componentId: 'recommend',
    event: 'recommend',
    data: { linkId: 'lnk_degraded', remediation: 'narrow-channel' },
  } as const;

  it("answers the confirmation with the operator's own choice and the model's reason", async () => {
    mockGeminiReply(triageReply);

    const surface = surfaceOf(await agentWith().respond(action));

    const intro = componentById(surface, 'intro')?.['text'] as string;
    // The operator picked narrow-channel; the model recommended raise-tx-power
    // on the offer. The confirmation names what the operator chose.
    expect(intro).toContain('Degraded Link');
    expect(intro).toContain('Narrow the Channel Width');
    expect(intro).toContain(triageReply.rationale);
    expect(componentById(surface, 'snr')?.['value']).toContain('dB');
  });

  it('refuses an Action naming a Surface it does not recognise', async () => {
    await expect(
      agentWith().respond({ ...action, surfaceId: 'not-a-real-surface' }),
    ).rejects.toThrow(/does not recognise Surface/);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('refuses an Action naming a Link the Fleet does not have', async () => {
    await expect(
      agentWith().respond({
        ...action,
        data: { linkId: 'lnk_9999', remediation: 'narrow-channel' },
      }),
    ).rejects.toThrow(/does not have/);
    expect(generateContent).not.toHaveBeenCalled();
  });
});
