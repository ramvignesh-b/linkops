import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import {
  bandSchema,
  linkCreateSchema,
  modeSchema,
  zodIssuesToFieldIssues,
  type Band,
  type ChannelWidthMhz,
  type FieldIssue,
  type LinkCreate,
  type Mode,
} from '@linkops/shared/domain';
import { issueFor } from './field-issue-lookup';

/**
 * What the form is for, as a discriminated union rather than an `isEdit`
 * boolean: the `create` variant has no `version` and no conflict path, and
 * the type says so rather than an optional field a create caller has to
 * remember to leave out. Only `create` is exercised until the editing slice
 * adds `edit`.
 */
export type LinkFormMode = { readonly kind: 'create' };

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
  template: `
    <form (submit)="onSubmit($event)">
      <div class="field" data-field="name">
        <label for="link-name">Name</label>
        <input
          id="link-name"
          name="name"
          type="text"
          [value]="value().name"
          (change)="onName($event)"
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
          (change)="onSiteA($event)"
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
          (change)="onSiteB($event)"
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
          (change)="onCapacity($event)"
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
          (change)="onTxPower($event)"
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

      <button type="submit" [disabled]="pending()">{{ submitLabel() }}</button>
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

    button {
      align-self: start;
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
  `,
})
export class LinkForm {
  readonly mode = input.required<LinkFormMode>();
  /** Set by the routed page after a Server rejection — the other half of the one `issueFor` lookup. */
  readonly serverIssues = input<readonly FieldIssue[]>([]);
  readonly pending = input<boolean>(false);
  /** A value that passed client-side validation, for the page to send. Never emitted for an invalid value. */
  readonly submitted = output<LinkCreate>();

  // Seeded directly from the single `create` variant rather than through
  // `this.mode()`: a required input cannot be read during construction
  // (NG8118), and `initialValue` only has one case to give until `edit`
  // lands, at which point deriving this from `mode` becomes an `effect`.
  protected readonly value = signal<LinkCreate>(DEFAULT_VALUE);
  private readonly clientIssues = signal<readonly FieldIssue[]>([]);

  protected readonly bandOptions = bandSchema.options;
  protected readonly modeOptions = modeSchema.options;
  protected readonly channelWidthOptions = CHANNEL_WIDTH_OPTIONS;

  protected readonly submitLabel = computed(() => {
    switch (this.mode().kind) {
      case 'create':
        return this.pending() ? 'Creating…' : 'Create Link';
    }
  });

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
