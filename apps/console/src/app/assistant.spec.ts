import { AssistantPanel } from '@linkops/console/feature-assistant';
import { A2UI_MAX_COMPONENTS } from '@linkops/shared/a2ui-protocol';
import { toLinkId, type FleetSummary, type Link } from '@linkops/shared/domain';
import {
  answerFirstPaint,
  bootConsole,
  finish,
  screen,
} from './testing/console-harness';

type Booted = Awaited<ReturnType<typeof bootConsole>>;

const AT = {
  load: '2026-08-16T10:00:00.000Z',
  tick41: '2026-08-16T10:00:41.000Z',
} as const;

const ALPHA = toLinkId('lnk_alpha');
const BRAVO = toLinkId('lnk_bravo');
const CHARLIE = toLinkId('lnk_charlie');

function link(overrides: Partial<Link> & Pick<Link, 'id' | 'name'>): Link {
  return {
    siteA: 'Ridge North',
    siteB: 'Ridge South',
    band: '5GHz',
    mode: 'PtP',
    capacityMbps: 100,
    txPowerDbm: 20,
    channelWidthMhz: 40,
    status: { status: 'up' },
    version: 1,
    createdAt: AT.load,
    updatedAt: AT.load,
    ...overrides,
  };
}

const alpha = link({
  id: ALPHA,
  name: 'Alpha Ridge',
  status: { status: 'up' },
});
const bravo = link({
  id: BRAVO,
  name: 'Bravo Pass',
  status: { status: 'degraded' },
});
const charlie = link({
  id: CHARLIE,
  name: 'Charlie Gap',
  status: { status: 'degraded' },
});

function summary(overrides: Partial<FleetSummary> = {}): FleetSummary {
  return {
    total: 2,
    up: 1,
    degraded: 1,
    down: 0,
    totalThroughputMbps: 0,
    worstLinkId: null,
    ...overrides,
  };
}

/**
 * The Surface the real stub would answer for a Fleet with degraded Links: one
 * option per Link needing attention, so a Fleet with two of them offers the
 * operator a choice of which to triage.
 */
function triageEnvelope(
  linkOptions: { value: string; label: string }[] = [
    { value: 'lnk_bravo', label: 'Bravo Pass' },
  ],
) {
  return {
    version: 'v1.0',
    createSurface: {
      surfaceId: 'triage',
      dataModel: { linkId: 'lnk_bravo', remediation: 'narrow-channel' },
      components: [
        { id: 'root', component: 'Surface', children: ['card'] },
        {
          id: 'card',
          component: 'Card',
          title: 'Triage',
          children: ['intro', 'link', 'remediation', 'recommend'],
        },
        {
          id: 'intro',
          component: 'Text',
          text: '1 Link is reporting readings that need attention. Pick a remediation to consider.',
        },
        {
          id: 'link',
          component: 'Select',
          label: 'Link',
          value: { path: '/linkId' },
          options: linkOptions,
        },
        {
          id: 'remediation',
          component: 'Select',
          label: 'Remediation',
          value: { path: '/remediation' },
          options: [
            { value: 'narrow-channel', label: 'Narrow the Channel Width' },
            { value: 'raise-tx-power', label: 'Raise Tx Power' },
          ],
        },
        {
          id: 'recommend',
          component: 'Button',
          label: 'Show the recommendation',
          action: { event: { name: 'recommend', context: {} } },
        },
      ],
    },
  };
}

/**
 * Boots the Console, answers first paint with the two seeded Links, opens the
 * panel and flushes a hand-crafted reply — the shape every hostile-payload
 * test shares, up to the one thing that makes it hostile.
 */
async function openAssistantWith(
  reply: Record<string, unknown>,
): Promise<Booted> {
  const booted = await bootConsole();
  answerFirstPaint(booted.http, [alpha, bravo], summary());
  await booted.fixture.whenStable();

  screen(booted.fixture).askAssistant();
  await booted.fixture.whenStable();

  booted.http.expectOne('/api/agent/ui').flush(reply);
  await booted.fixture.whenStable();

  return booted;
}

/** Every rendered `Card`'s title, in document order. */
function cardTitlesOf(booted: Booted): string[] {
  return [
    ...(booted.fixture.nativeElement as HTMLElement).querySelectorAll(
      '.a2ui-card h3',
    ),
  ].map((element) => (element.textContent ?? '').trim());
}

describe('the triage panel', () => {
  it('is absent until asked, asks the assistant once, and renders the Surface it answers, with the Fleet still ticking behind it', async () => {
    const { fixture, http, stream } = await bootConsole();

    answerFirstPaint(
      http,
      [alpha, bravo],
      summary({ up: 1, degraded: 1, totalThroughputMbps: 61 }),
    );
    await fixture.whenStable();

    const view = screen(fixture);

    // Absent until asked: no request has been made for it.
    http.expectNone('/api/agent/ui');

    view.askAssistant();
    await fixture.whenStable();

    const request = http.expectOne('/api/agent/ui');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ kind: 'open' });
    request.flush(triageEnvelope());
    await fixture.whenStable();

    expect(view.assistantCardTitle()).toBe('Triage');
    expect(view.assistantTexts()).toContain(
      '1 Link is reporting readings that need attention. Pick a remediation to consider.',
    );
    expect(view.assistantSelectOptions('link')).toEqual(['Bravo Pass']);
    expect(view.assistantSelectOptions('remediation')).toEqual([
      'Narrow the Channel Width',
      'Raise Tx Power',
    ]);
    expect(view.assistantButtonLabel()).toBe('Show the recommendation');

    // Only one request, ever — opening asks once.
    http.expectNone('/api/agent/ui');

    // The Fleet beneath keeps applying Ticks while the panel is open.
    stream().emit(
      'fleet.snapshot',
      {
        tick: 41,
        ts: AT.tick41,
        links: [
          alpha,
          { ...bravo, status: { status: 'down', reason: 'metrics' } },
        ],
        samples: [],
        summary: summary({ up: 1, degraded: 0, down: 1 }),
      },
      41,
    );
    await fixture.whenStable();
    expect(view.status(BRAVO)).toBe('down · poor signal');

    // Closing leaves the Fleet exactly as it was.
    view.closeAssistant();
    await fixture.whenStable();
    expect(view.rowNames()).toEqual(['Alpha Ridge', 'Bravo Pass']);
    expect(view.status(BRAVO)).toBe('down · poor signal');

    finish();
  });

  it('shows a loading spinner while the remote is fetched, and the panel once it resolves', async () => {
    // The default `bootConsole` loader settles immediately, which is right
    // for every other test here but leaves no pending moment to observe —
    // this test supplies its own, held open until asserted against.
    let resolveLoad!: (component: typeof AssistantPanel) => void;
    const loading = new Promise<typeof AssistantPanel>((resolve) => {
      resolveLoad = resolve;
    });

    // Dynamic, not static — see `bootConsole`'s own import of the same
    // token for why.
    const { ASSISTANT_REMOTE_LOADER } = await import(
      '@linkops/console/feature-fleet'
    );
    const { fixture, http } = await bootConsole('/links', [
      { provide: ASSISTANT_REMOTE_LOADER, useValue: () => loading },
    ]);
    answerFirstPaint(http, [alpha, bravo], summary());
    await fixture.whenStable();

    const view = screen(fixture);
    view.askAssistant();
    await fixture.whenStable();

    // Still waiting on the remote: no request for the Assistant has been
    // made yet, because the panel it would come from is not mounted.
    expect(view.assistantLoadingText()).toContain('Loading the assistant');
    http.expectNone('/api/agent/ui');

    resolveLoad(AssistantPanel);
    // `whenStable()` alone races the resolution above: called immediately,
    // it can observe the fixture as already stable and return before
    // `AssistantWrapper`'s own `.then()` — queued ahead of this one, since it
    // was attached first — has run. Awaiting the same promise first forces
    // that ordering, so `whenStable()` then has real, newly-scheduled work
    // to wait for.
    await loading;
    await fixture.whenStable();

    // The spinner is gone, and the panel underneath has already opened its
    // own conversation.
    expect(view.assistantLoadingText()).toBe('');
    http.expectOne('/api/agent/ui').flush(triageEnvelope());
    await fixture.whenStable();
    expect(view.assistantCardTitle()).toBe('Triage');

    finish();
  });

  it('renders a labelled fallback for an unknown component type, and the rest of the Surface still renders', async () => {
    const booted = await openAssistantWith({
      version: 'v1.0',
      createSurface: {
        surfaceId: 'hostile',
        components: [
          { id: 'root', component: 'Surface', children: ['known', 'bogus'] },
          { id: 'known', component: 'Text', text: 'This part is fine.' },
          { id: 'bogus', component: 'Widget', text: 'never rendered' },
        ],
      },
    });

    const view = screen(booted.fixture);
    expect(view.assistantTexts()).toEqual(['This part is fine.']);
    expect(view.assistantFallbackLabels()).toEqual([
      'Unknown component "Widget"',
    ]);

    finish();
  });

  it('renders the fallback at the depth cap, with everything above it rendering normally', async () => {
    // A chain eleven levels deep: root, then ten nested Cards, the last of
    // which points to a Text leaf nothing should ever reach.
    const ids = Array.from({ length: 10 }, (_, index) => `card-${index}`);
    const components = [
      { id: 'root', component: 'Surface', children: [ids[0]] },
      ...ids.map((id, index) => ({
        id,
        component: 'Card',
        title: id,
        children: [index + 1 < ids.length ? ids[index + 1] : 'leaf'],
      })),
      { id: 'leaf', component: 'Text', text: 'unreachable' },
    ];

    const booted = await openAssistantWith({
      version: 'v1.0',
      createSurface: { surfaceId: 'hostile', components },
    });

    // Levels 1–10 (the root plus nine Cards) render normally; the tenth
    // Card — level 11 — is the fallback, and the leaf beyond it never
    // renders at all.
    expect(cardTitlesOf(booted)).toEqual(ids.slice(0, 9));
    expect(screen(booted.fixture).assistantFallbackLabels()).toEqual([
      'Too deeply nested to render',
    ]);
    expect(booted.fixture.nativeElement.textContent).not.toContain(
      'unreachable',
    );

    finish();
  });

  it('renders a fallback for a component referencing an ancestor, rather than recursing', async () => {
    // root -> a -> b -> a: b's child refers back to its own ancestor.
    // Completing at all — rather than a stack overflow — is most of the
    // assertion here.
    const booted = await openAssistantWith({
      version: 'v1.0',
      createSurface: {
        surfaceId: 'hostile',
        components: [
          { id: 'root', component: 'Surface', children: ['a'] },
          { id: 'a', component: 'Card', title: 'a', children: ['b'] },
          { id: 'b', component: 'Card', title: 'b', children: ['a'] },
        ],
      },
    });

    expect(cardTitlesOf(booted)).toEqual(['a', 'b']);
    expect(screen(booted.fixture).assistantFallbackLabels()).toEqual([
      'A component cannot contain itself',
    ]);

    finish();
  });

  it('refuses a binding through __proto__ on both a read and a write, and pollutes nothing', async () => {
    const booted = await openAssistantWith({
      version: 'v1.0',
      createSurface: {
        surfaceId: 'hostile',
        dataModel: {},
        components: [
          { id: 'root', component: 'Surface', children: ['card'] },
          {
            id: 'card',
            component: 'Card',
            children: ['leakText', 'leakSelect'],
          },
          {
            id: 'leakText',
            component: 'Text',
            text: { path: '/__proto__/polluted' },
          },
          {
            id: 'leakSelect',
            component: 'Select',
            label: 'Leak',
            value: { path: '/__proto__/polluted' },
            options: [{ value: 'x', label: 'X' }],
          },
        ],
      },
    });

    // The read: a binding through `__proto__` renders no value.
    const view = screen(booted.fixture);
    expect(view.assistantTexts()).toEqual(['']);

    // The write: changing the Select attempts a write through the same
    // forbidden segment.
    view.setAssistantSelect('leakSelect', 'x');
    await booted.fixture.whenStable();

    // Neither reached the prototype chain.
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();

    finish();
  });

  it('caps the total number of components rendered, even across a wide payload of fallbacks', async () => {
    // A thousand children of the root, every one a dangling reference — a
    // hostile payload wide rather than deep, so the depth cap never engages.
    // Every one of these previously rendered its own fallback uncounted.
    const ids = Array.from({ length: 1000 }, (_, index) => `missing-${index}`);
    const booted = await openAssistantWith({
      version: 'v1.0',
      createSurface: {
        surfaceId: 'hostile',
        components: [{ id: 'root', component: 'Surface', children: ids }],
      },
    });

    const fallbackCount = (
      booted.fixture.nativeElement as HTMLElement
    ).querySelectorAll('.a2ui-fallback').length;
    expect(fallbackCount).toBeLessThanOrEqual(100);

    finish();
  });

  it('ignores a stale reply that arrives after a later request was already sent', async () => {
    const { fixture, http } = await bootConsole();
    answerFirstPaint(http, [alpha, bravo], summary());
    await fixture.whenStable();

    const view = screen(fixture);
    view.askAssistant();
    await fixture.whenStable();
    view.closeAssistant();
    await fixture.whenStable();
    view.askAssistant();
    await fixture.whenStable();

    const requests = http.match('/api/agent/ui');
    expect(requests).toHaveLength(2);

    const [first, second] = requests;

    // Reopening cancels the older request outright — the same as a real
    // browser aborting the abandoned XHR — so there is no stale reply left
    // to arrive at all, whatever order the two would have resolved in.
    expect(first.cancelled).toBe(true);

    second.flush({
      version: 'v1.0',
      createSurface: {
        surfaceId: 'triage',
        components: [
          { id: 'root', component: 'Surface', children: ['t'] },
          { id: 't', component: 'Text', text: 'The current answer.' },
        ],
      },
    });
    await fixture.whenStable();

    expect(view.assistantTexts()).toEqual(['The current answer.']);

    finish();
  });

  it('caps a single Select to a bounded number of options, even given a huge literal array', async () => {
    const options = Array.from(
      { length: A2UI_MAX_COMPONENTS * 20 },
      (_, index) => ({
        value: `v${index}`,
        label: `Option ${index}`,
      }),
    );

    const booted = await openAssistantWith({
      version: 'v1.0',
      createSurface: {
        surfaceId: 'hostile',
        dataModel: {},
        components: [
          { id: 'root', component: 'Surface', children: ['sel'] },
          {
            id: 'sel',
            component: 'Select',
            label: 'Wide',
            value: { path: '/choice' },
            options,
          },
        ],
      },
    });

    const rendered = (
      booted.fixture.nativeElement as HTMLElement
    ).querySelectorAll('select[name="sel"] option').length;
    expect(rendered).toBeLessThanOrEqual(A2UI_MAX_COMPONENTS);

    finish();
  });

  it('shows the operator copy for a reply that fails the envelope schema, and never the diagnostic message', async () => {
    // Not an A2UI envelope at all — the Server's own diagnostic prose, the
    // kind of body an unhandled exception would answer with.
    const booted = await openAssistantWith({
      error: {
        code: 'INTERNAL',
        message: 'TypeError: cannot read properties of undefined at line 42',
      },
    });

    expect(screen(booted.fixture).assistantFailureText()).toBe(
      'The assistant sent something the Console could not use.',
    );
    expect(booted.fixture.nativeElement.textContent).not.toContain(
      'cannot read properties of undefined',
    );

    finish();
  });

  it('round-trips a remediation: the operator picks, presses the button, and the confirmation replaces the offer', async () => {
    const { fixture, http } = await bootConsole();
    answerFirstPaint(
      http,
      [alpha, bravo, charlie],
      summary({ total: 3, degraded: 2 }),
    );
    await fixture.whenStable();

    const view = screen(fixture);

    // Open the panel and flush a triage offer naming both degraded Links, so
    // which one the operator picks is a real choice rather than a foregone one.
    view.askAssistant();
    await fixture.whenStable();

    http.expectOne('/api/agent/ui').flush(
      triageEnvelope([
        { value: 'lnk_bravo', label: 'Bravo Pass' },
        { value: 'lnk_charlie', label: 'Charlie Gap' },
      ]),
    );
    await fixture.whenStable();

    // The offer is rendered: verify the initial state.
    expect(view.assistantCardTitle()).toBe('Triage');
    expect(view.assistantButtonLabel()).toBe('Show the recommendation');
    expect(view.assistantSelectOptions('link')).toEqual([
      'Bravo Pass',
      'Charlie Gap',
    ]);

    // The operator picks in both pickers — a Link other than the one the offer
    // was seeded with, and a different remediation.
    view.setAssistantSelect('link', 'lnk_charlie');
    await fixture.whenStable();
    view.setAssistantSelect('remediation', 'raise-tx-power');
    await fixture.whenStable();

    // Press the button — this sends the Action back to the Assistant.
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLElement>('.a2ui-button')
      ?.click();
    await fixture.whenStable();

    // The Action request carries the surface id, the component id, the event
    // name and the current Data Model — the operator's choices, not the
    // Button's raw context bindings.
    const actionRequest = http.expectOne('/api/agent/ui');
    expect(actionRequest.request.method).toBe('POST');
    expect(actionRequest.request.body).toEqual({
      kind: 'act',
      surfaceId: 'triage',
      componentId: 'recommend',
      event: 'recommend',
      data: { linkId: 'lnk_charlie', remediation: 'raise-tx-power' },
    });

    // The Server answers with the confirmation Surface — naming the Link and
    // the Remediation chosen, with both Metrics.
    actionRequest.flush({
      version: 'v1.0',
      createSurface: {
        surfaceId: 'triage',
        components: [
          { id: 'root', component: 'Surface', children: ['card'] },
          {
            id: 'card',
            component: 'Card',
            title: 'Triage',
            children: ['intro', 'snr', 'throughput'],
          },
          {
            id: 'intro',
            component: 'Text',
            text: 'Charlie Gap: Raise Tx Power — more margin, within the licensed limit',
          },
          { id: 'snr', component: 'Metric', label: 'SNR', value: '12 dB' },
          {
            id: 'throughput',
            component: 'Metric',
            label: 'Throughput',
            value: '30 / 100 Mbps',
          },
        ],
      },
    });
    await fixture.whenStable();

    // The confirmation Surface replaces the offer.
    expect(view.assistantCardTitle()).toBe('Triage');
    expect(view.assistantTexts()).toEqual([
      'Charlie Gap: Raise Tx Power — more margin, within the licensed limit',
    ]);

    // Both Metrics are rendered.
    const metricLabels = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll(
        '.a2ui-metric-label',
      ),
    ].map((el) => (el.textContent ?? '').trim());
    const metricValues = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll(
        '.a2ui-metric-value',
      ),
    ].map((el) => (el.textContent ?? '').trim());
    expect(metricLabels).toEqual(['SNR', 'Throughput']);
    expect(metricValues).toEqual(['12 dB', '30 / 100 Mbps']);

    // The Button is gone — the confirmation has no operator-editable controls.
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.a2ui-button'),
    ).toBeNull();

    finish();
  });

  it('leaves the offer onscreen when an Action fails, so the operator can press again', async () => {
    const { fixture, http } = await bootConsole();
    answerFirstPaint(http, [alpha, bravo], summary());
    await fixture.whenStable();

    const view = screen(fixture);
    view.askAssistant();
    await fixture.whenStable();

    http.expectOne('/api/agent/ui').flush(triageEnvelope());
    await fixture.whenStable();

    view.setAssistantSelect('remediation', 'raise-tx-power');
    await fixture.whenStable();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLElement>('.a2ui-button')
      ?.click();
    await fixture.whenStable();

    // The Server never answers.
    http
      .expectOne('/api/agent/ui')
      .error(new ProgressEvent('error'), { status: 0 });
    await fixture.whenStable();

    // The operator is told, and the offer they were working on is still there
    // — a failed round trip costs them the panel's state, otherwise, and
    // "Try again" has nothing left to try.
    expect(view.assistantFailureText()).toBe(
      'The assistant did not answer. Try again.',
    );
    expect(view.assistantCardTitle()).toBe('Triage');
    expect(view.assistantButtonLabel()).toBe('Show the recommendation');

    // Including the remediation they had picked.
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLElement>('.a2ui-button')
      ?.click();
    await fixture.whenStable();

    expect(http.expectOne('/api/agent/ui').request.body).toEqual({
      kind: 'act',
      surfaceId: 'triage',
      componentId: 'recommend',
      event: 'recommend',
      data: { linkId: 'lnk_bravo', remediation: 'raise-tx-power' },
    });

    finish();
  });
});
