import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import {
  bandSchema,
  linkStatusKindSchema,
  type Band,
  type LinkSortKey,
  type LinkStatusKind,
  type SortDir,
} from '@linkops/shared/domain';

/**
 * The controls over the Fleet list: Status, Band and free text to filter by,
 * and a sort key with a direction. Purely presentational — every value it
 * shows is an input and every change it makes is an output — so the routed
 * page above it stays the only component that reads or writes the URL.
 *
 * The option lists come from the shared schemas rather than being retyped
 * here, so a Band or Status added to the wire contract shows up in this
 * control without a second edit.
 */
@Component({
  selector: 'lib-fleet-filter-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label>
      Status
      <select
        name="status"
        [value]="status() ?? ''"
        (change)="onStatus($event)"
      >
        <option value="">All statuses</option>
        @for (option of statusOptions; track option) {
          <option [value]="option">{{ option }}</option>
        }
      </select>
    </label>

    <label>
      Band
      <select name="band" [value]="band() ?? ''" (change)="onBand($event)">
        <option value="">All bands</option>
        @for (option of bandOptions; track option) {
          <option [value]="option">{{ option }}</option>
        }
      </select>
    </label>

    <label>
      Search
      <input
        name="q"
        type="search"
        placeholder="Name or Site"
        [value]="q() ?? ''"
        (change)="onQ($event)"
      />
    </label>

    <label>
      Sort by
      <select name="sort" [value]="sort()" (change)="onSort($event)">
        @for (option of sortOptions; track option.value) {
          <option [value]="option.value">{{ option.label }}</option>
        }
      </select>
    </label>

    <label>
      Direction
      <select name="dir" [value]="dir()" (change)="onDir($event)">
        <option value="asc">Ascending</option>
        <option value="desc">Descending</option>
      </select>
    </label>
  `,
  styles: `
    :host {
      display: flex;
      flex-wrap: wrap;
      align-items: end;
      gap: var(--space-3);
      margin-bottom: var(--space-3);
    }

    label {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      color: var(--text-muted);
      font-size: var(--font-size-small);
    }

    select,
    input {
      padding: var(--space-1) var(--space-2);
      background: var(--surface-raised);
      color: var(--text-primary);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      font-family: inherit;
      font-size: inherit;
    }

    select:focus,
    input:focus {
      outline: var(--focus-ring);
      outline-offset: 1px;
    }
  `,
})
export class FleetFilterBar {
  /** `undefined` means unfiltered, mirroring `LinkListQuery`'s own optional fields. */
  readonly status = input<LinkStatusKind>();
  readonly band = input<Band>();
  readonly q = input<string>();
  readonly sort = input.required<LinkSortKey>();
  readonly dir = input.required<SortDir>();

  /** `null` means "clear this filter" — never an empty string standing in for absence. */
  readonly statusChange = output<LinkStatusKind | null>();
  readonly bandChange = output<Band | null>();
  readonly qChange = output<string | null>();
  readonly sortChange = output<LinkSortKey>();
  readonly dirChange = output<SortDir>();

  protected readonly statusOptions = linkStatusKindSchema.options;
  protected readonly bandOptions = bandSchema.options;
  protected readonly sortOptions: { value: LinkSortKey; label: string }[] = [
    { value: 'name', label: 'Name' },
    { value: 'capacityMbps', label: 'Capacity' },
    { value: 'status', label: 'Status' },
    { value: 'throughputMbps', label: 'Throughput' },
  ];

  protected onStatus(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.statusChange.emit(value === '' ? null : (value as LinkStatusKind));
  }

  protected onBand(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.bandChange.emit(value === '' ? null : (value as Band));
  }

  protected onQ(event: Event): void {
    const value = (event.target as HTMLInputElement).value.trim();
    this.qChange.emit(value === '' ? null : value);
  }

  protected onSort(event: Event): void {
    this.sortChange.emit(
      (event.target as HTMLSelectElement).value as LinkSortKey,
    );
  }

  protected onDir(event: Event): void {
    this.dirChange.emit((event.target as HTMLSelectElement).value as SortDir);
  }
}
