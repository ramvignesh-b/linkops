import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** One figure from the Fleet Summary, with the word for what it counts. */
@Component({
  selector: 'lib-summary-figure-tile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="summary-label">{{ label() }}</span>
    <span class="summary-value">{{ value() }}</span>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      padding: var(--space-2) var(--space-3);
      background: var(--surface-raised);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      min-width: 96px;
    }

    .summary-label {
      color: var(--text-muted);
      font-size: var(--font-size-small);
    }

    .summary-value {
      font-family: var(--font-family-mono);
      font-size: var(--font-size-heading);
      font-weight: var(--font-weight-strong);
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class SummaryFigureTile {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
}
