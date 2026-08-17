import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  bandSchema,
  linkCreateSchema,
  modeSchema,
  zodIssuesToFieldIssues,
  type Band,
  type ChannelWidthMhz,
  type FieldIssue,
  type Link,
  type LinkCreate,
  type Mode,
} from '@linkops/shared/domain';
import { issueFor } from './field-issue-lookup';

/**
 * What the form is for, as a discriminated union rather than an `isEdit`
 * boolean: the `create` variant has no Link behind it, and `edit` carries the
 * Link it pre-fills from, so the type says which is true rather than an
 * optional field a caller has to remember to leave out or supply. `edit`
 * carries the whole Link, not a `version` alongside a value, so the routed
 * page's own state stays the one place a version is tracked — this only ever
 * seeds the fields an operator can change.
 */
export type LinkFormMode =
  | { readonly kind: 'create' }
  | { readonly kind: 'edit'; readonly link: Link };

/**
 * A Link's eight editable fields, the shape `linkCreateSchema` validates.
 * Exported for the routed edit page, which needs the same extraction to seed
 * a conflict's "mine" side when the Server never got the operator's own
 * patch — a version conflict raised elsewhere, and "keep mine" resubmitting
 * an unmodified value both take this path.
 */
export function toLinkCreate(link: Link): LinkCreate {
  return {
    name: link.name,
    siteA: link.siteA,
    siteB: link.siteB,
    band: link.band,
    mode: link.mode,
    capacityMbps: link.capacityMbps,
    txPowerDbm: link.txPowerDbm,
    channelWidthMhz: link.channelWidthMhz,
  };
}

const DEFAULT_VALUE: LinkCreate = {
  name: '',
  siteA: '',
  siteB: '',
  band: '5GHz',
  mode: 'PtP',
  capacityMbps: 100,
  txPowerDbm: 20,
  channelWidthMhz: 40,
};

/** The literals `channelWidthMhzSchema` allows — a union of literals has no `.options` the way an enum does. */
const CHANNEL_WIDTH_OPTIONS: readonly ChannelWidthMhz[] = [20, 40, 80];

/**
 * The eight fields a Link is configured by, over the shared `linkCreateSchema`
 * — the same schema the Server's `LinkCreateDto` validates with, run here as
 * one whole-value validator rather than one per control, so a rule spanning
 * two fields (if one is ever added) has a home. `issueFor` is the one place
 * either that client-side result or a Server `issues` input becomes a
 * control's message, so the two can never disagree about where an error lands.
 *
 * Submits nothing itself: a client-side failure sets `issues` and stops, so
 * no request is ever issued for an invalid value; a passing value is emitted
 * on `submitted` for the routed page to send, because only the page knows
 * which endpoint and which HTTP verb this mode calls for.
 */
@Component({
  selector: 'lib-link-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <form (submit)="onSubmit($event)">
      <div class="field" data-field="name">
        <label for="link-name">Name</label>
        <input
          id="link-name"
          name="name"
          type="text"
          [value]="value().name"
          (input)="onName($event)"
          [attr.aria-invalid]="issueFor('name') !== null"
        />
        @if (issueFor('name'); as message) {
          <p class="field-error">{{ message }}</p>
        }
      </div>

      <div class="field" data-field="siteA">
        <label for="link-siteA">Site A</label>
        <input
          id="link-siteA"
          name="siteA"
          type="text"
          [value]="value().siteA"
          (input)="onSiteA($event)"
          [attr.aria-invalid]="issueFor('siteA') !== null"
        />
        @if (issueFor('siteA'); as message) {
          <p class="field-error">{{ message }}</p>
        }
      </div>

      <div class="field" data-field="siteB">
        <label for="link-siteB">Site B</label>
        <input
          id="link-siteB"
          name="siteB"
          type="text"
          [value]="value().siteB"
          (input)="onSiteB($event)"
          [attr.aria-invalid]="issueFor('siteB') !== null"
        />
        @if (issueFor('siteB'); as message) {
          <p class="field-error">{{ message }}</p>
        }
      </div>

      <div class="field" data-field="band">
        <label for="link-band">Band</label>
        <select
          id="link-band"
          name="band"
          [value]="value().band"
          (change)="onBand($event)"
          [attr.aria-invalid]="issueFor('band') !== null"
        >
          @for (option of bandOptions; track option) {
            <option [value]="option">{{ option }}</option>
          }
        </select>
        @if (issueFor('band'); as message) {
          <p class="field-error">{{ message }}</p>
        }
      </div>

      <div class="field" data-field="mode">
        <label for="link-mode">Mode</label>
        <select
          id="link-mode"
          name="mode"
          [value]="value().mode"
          (change)="onMode($event)"
          [attr.aria-invalid]="issueFor('mode') !== null"
        >
          @for (option of modeOptions; track option) {
            <option [value]="option">{{ option }}</option>
          }
        </select>
        @if (issueFor('mode'); as message) {
          <p class="field-error">{{ message }}</p>
        }
      </div>

      <div class="field" data-field="capacityMbps">
        <label for="link-capacityMbps">Capacity (Mbps)</label>
        <input
          id="link-capacityMbps"
          name="capacityMbps"
          type="number"
          [value]="value().capacityMbps"
          (input)="onCapacity($event)"
          [attr.aria-invalid]="issueFor('capacityMbps') !== null"
        />
        @if (issueFor('capacityMbps'); as message) {
          <p class="field-error">{{ message }}</p>
        }
      </div>

      <div class="field" data-field="txPowerDbm">
        <label for="link-txPowerDbm">Tx Power (dBm)</label>
        <input
          id="link-txPowerDbm"
          name="txPowerDbm"
          type="number"
          [value]="value().txPowerDbm"
          (input)="onTxPower($event)"
          [attr.aria-invalid]="issueFor('txPowerDbm') !== null"
        />
        @if (issueFor('txPowerDbm'); as message) {
          <p class="field-error">{{ message }}</p>
        }
      </div>

      <div class="field" data-field="channelWidthMhz">
        <label for="link-channelWidthMhz">Channel Width (MHz)</label>
        <select
          id="link-channelWidthMhz"
          name="channelWidthMhz"
          [value]="value().channelWidthMhz"
          (change)="onChannelWidth($event)"
          [attr.aria-invalid]="issueFor('channelWidthMhz') !== null"
        >
          @for (option of channelWidthOptions; track option) {
            <option [value]="option">{{ option }}</option>
          }
        </select>
        @if (issueFor('channelWidthMhz'); as message) {
          <p class="field-error">{{ message }}</p>
        }
      </div>

      <div class="form-actions">
        <button type="submit" [disabled]="pending()">
          {{ submitLabel() }}
        </button>
        @if (cancelLink(); as link) {
          <a [routerLink]="link" class="cancel-link">Cancel</a>
        }
      </div>
    </form>
  `,
  styles: `
    form {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      max-width: 420px;
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    label {
      color: var(--text-muted);
      font-size: var(--font-size-small);
    }

    input,
    select {
      padding: var(--space-1) var(--space-2);
      background: var(--surface-raised);
      color: var(--text-primary);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      font-family: inherit;
      font-size: inherit;
    }

    input:focus,
    select:focus {
      outline: var(--focus-ring);
      outline-offset: 1px;
    }

    input[aria-invalid='true'],
    select[aria-invalid='true'] {
      border-color: var(--status-down);
    }

    .field-error {
      margin: 0;
      color: var(--status-down);
      font-size: var(--font-size-small);
    }

    .form-actions {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      margin-top: var(--space-1);
    }

    button {
      padding: var(--space-2) var(--space-3);
      background: var(--accent);
      color: var(--surface-raised);
      border: none;
      border-radius: var(--radius);
      font-weight: var(--font-weight-medium);
      cursor: pointer;
    }

    button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .cancel-link {
      color: var(--text-muted);
      font-weight: var(--font-weight-medium);
      text-decoration: none;
      font-size: var(--font-size-body);
    }

    .cancel-link:hover {
      color: var(--text-primary);
      text-decoration: underline;
    }
  `,
})
export class LinkForm {
  readonly mode = input.required<LinkFormMode>();
  /** Set by the routed page after a Server rejection — the other half of the one `issueFor` lookup. */
  readonly serverIssues = input<readonly FieldIssue[]>([]);
  readonly pending = input<boolean>(false);
  readonly cancelLink = input<string | readonly string[] | null>(null);
  /** A value that passed client-side validation, for the page to send. Never emitted for an invalid value. */
  readonly submitted = output<LinkCreate>();

  // Defaults to `create`'s starting value; `edit` re-seeds it below, in an
  // `effect` rather than here, because a required input cannot be read
  // during construction (NG8118).
  protected readonly value = signal<LinkCreate>(DEFAULT_VALUE);
  private readonly clientIssues = signal<readonly FieldIssue[]>([]);

  protected readonly bandOptions = bandSchema.options;
  protected readonly modeOptions = modeSchema.options;
  protected readonly channelWidthOptions = CHANNEL_WIDTH_OPTIONS;

  protected readonly submitLabel = computed(() => {
    switch (this.mode().kind) {
      case 'create':
        return this.pending() ? 'Creating…' : 'Create Link';
      case 'edit':
        return this.pending() ? 'Saving…' : 'Save changes';
    }
  });

  constructor() {
    // Re-seeds `value` whenever `mode` names a different Link to edit — the
    // one seam "take theirs" resolves a conflict through: the routed page
    // passes a fresh `edit` mode and this form repaints from it, with no
    // event of its own needed for that one case.
    effect(() => {
      const mode = this.mode();
      if (mode.kind === 'edit') {
        this.value.set(toLinkCreate(mode.link));
      }
    });
  }

  protected issueFor(path: string): string | null {
    // Client issues take precedence: they describe the value on screen right
    // now, where server issues describe a value from the last attempt.
    const clientMessage = issueFor(this.clientIssues(), path);

    return clientMessage ?? issueFor(this.serverIssues(), path);
  }

  protected onName(event: Event): void {
    this.updateField({ name: this.textValue(event) });
  }

  protected onSiteA(event: Event): void {
    this.updateField({ siteA: this.textValue(event) });
  }

  protected onSiteB(event: Event): void {
    this.updateField({ siteB: this.textValue(event) });
  }

  protected onBand(event: Event): void {
    this.updateField({
      band: (event.target as HTMLSelectElement).value as Band,
    });
  }

  protected onMode(event: Event): void {
    this.updateField({
      mode: (event.target as HTMLSelectElement).value as Mode,
    });
  }

  protected onCapacity(event: Event): void {
    this.updateField({ capacityMbps: this.numberValue(event) });
  }

  protected onTxPower(event: Event): void {
    this.updateField({ txPowerDbm: this.numberValue(event) });
  }

  protected onChannelWidth(event: Event): void {
    this.updateField({
      channelWidthMhz: this.numberValue(event) as ChannelWidthMhz,
    });
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();

    const result = linkCreateSchema.safeParse(this.value());
    if (!result.success) {
      this.clientIssues.set(zodIssuesToFieldIssues(result.error.issues));

      return;
    }

    this.clientIssues.set([]);
    this.submitted.emit(result.data);
  }

  private textValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  private numberValue(event: Event): number {
    return Number((event.target as HTMLInputElement).value);
  }

  private updateField(patch: Partial<LinkCreate>): void {
    this.value.update((current) => ({ ...current, ...patch }));
  }
}
