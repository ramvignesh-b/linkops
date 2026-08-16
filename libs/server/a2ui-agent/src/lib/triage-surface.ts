import type { A2uiCreateSurface } from '@linkops/shared/a2ui-protocol';
import type { Link, TelemetrySample } from '@linkops/shared/domain';

/**
 * What the Assistant is willing to suggest, and the whole of it. Each one is
 * a change an operator makes on the Link form afterwards — the Assistant
 * recommends and never writes, so these are the vocabulary of a
 * recommendation rather than commands anything executes.
 */
export const REMEDIATIONS = [
  {
    value: 'narrow-channel',
    label: 'Narrow the Channel Width — less throughput, less interference',
  },
  {
    value: 'raise-tx-power',
    label: 'Raise Tx Power — more margin, within the licensed limit',
  },
  {
    value: 'lower-band',
    label:
      'Move to a lower Band — longer reach and less rain loss, at less capacity',
  },
] as const;

/**
 * The one Surface this Assistant authors, offer and confirmation alike — a
 * reply naming an id this endpoint does not recognise is exactly what an
 * Action naming an unknown Surface is refused against. Exported so
 * `StubTriageAgent` can hold the Assistant to a Surface it actually sent.
 */
export const SURFACE_ID = 'triage';

/** What the Assistant is willing to recommend, as a single value. */
export type Remediation = (typeof REMEDIATIONS)[number];

/**
 * Every Surface here is one Card on a root Surface; only its contents
 * differ. Written once so the two cannot drift into looking like two
 * different screens.
 */
function shell(
  children: string[],
  ...contents: A2uiCreateSurface['components']
): A2uiCreateSurface['components'] {
  return [
    { id: 'root', component: 'Surface', children: ['card'] },
    { id: 'card', component: 'Card', title: 'Triage', children },
    ...contents,
  ];
}

/** The Surface offered when nothing on the Fleet is worth triaging. */
export function quietSurface(): A2uiCreateSurface {
  return {
    surfaceId: SURFACE_ID,
    components: shell(['intro'], {
      id: 'intro',
      component: 'Text',
      // Deliberately not "every Link is healthy": a Link reporting nothing
      // at all is down for want of data, which is a different conversation
      // from one a configuration change would help.
      text: 'No Link is reporting readings that a configuration change would help.',
    }),
  };
}

function introText(links: readonly Link[]): string {
  return links.length === 1
    ? '1 Link is reporting readings that need attention. Pick a remediation to consider.'
    : `${links.length} Links are reporting readings that need attention. Pick one, and a remediation to consider.`;
}

/**
 * The triage offer: the Links whose readings need attention, the
 * remediations worth considering, and the Button that asks for one.
 *
 * The Data Model starts on the first Link and the first remediation, so the
 * Surface is answerable without touching either control — the two Selects
 * write the operator's choice back over these.
 */
export function triageSurface(links: readonly Link[]): A2uiCreateSurface {
  return {
    surfaceId: SURFACE_ID,
    dataModel: { linkId: links[0].id, remediation: REMEDIATIONS[0].value },
    components: shell(
      ['intro', 'link', 'remediation', 'recommend'],
      { id: 'intro', component: 'Text', text: introText(links) },
      {
        id: 'link',
        component: 'Select',
        label: 'Link',
        value: { path: '/linkId' },
        options: links.map((link) => ({ value: link.id, label: link.name })),
      },
      {
        id: 'remediation',
        component: 'Select',
        label: 'Remediation',
        value: { path: '/remediation' },
        options: [...REMEDIATIONS],
      },
      {
        id: 'recommend',
        component: 'Button',
        label: 'Show the recommendation',
        action: {
          event: {
            name: 'recommend',
            context: {
              linkId: { path: '/linkId' },
              remediation: { path: '/remediation' },
            },
          },
        },
      },
    ),
  };
}

/** `—` is a Sample nobody has taken yet, the same rule the Console reads Throughput by. */
function sampleText(
  sample: TelemetrySample | null,
  format: (sample: TelemetrySample) => string,
): string {
  return sample === null ? '—' : format(sample);
}

/**
 * The confirmation: the Link and the Remediation the operator chose, and the
 * Sample the recommendation rests on, as two Metrics. Both values are
 * literal — nothing here is operator-editable, so there is no Data Model
 * left to bind against. Together with `triageSurface`'s `Select` and
 * `Button`, this is the last of the six whitelisted component types
 * exercised by the product rather than only by hostile fixtures.
 */
export function confirmationSurface(
  link: Link,
  remediation: Remediation,
  sample: TelemetrySample | null,
): A2uiCreateSurface {
  return {
    surfaceId: SURFACE_ID,
    components: shell(
      ['intro', 'snr', 'throughput'],
      {
        id: 'intro',
        component: 'Text',
        text: `${link.name}: ${remediation.label}`,
      },
      {
        id: 'snr',
        component: 'Metric',
        label: 'SNR',
        value: sampleText(sample, (s) => `${s.snrDb} dB`),
      },
      {
        id: 'throughput',
        component: 'Metric',
        label: 'Throughput',
        value: sampleText(
          sample,
          (s) => `${Math.round(s.throughputMbps)} / ${link.capacityMbps} Mbps`,
        ),
      },
    ),
  };
}
