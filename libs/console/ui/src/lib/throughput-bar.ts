import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

/**
 * Throughput against the Capacity the Link is provisioned for, because a bare
 * number is the misreading: 40 Mbps is healthy on a 50 Mbps Link and a fault on
 * a 1000 Mbps one.
 *
 * `null` throughput is *no reading taken*, not zero. It is what a row shows
 * between first paint over REST — which carries the Roster but no Samples — and
 * the first frame off the stream, and rendering it as `0` would be inventing a
 * measurement nobody made.
 */
@Component({
  selector: 'lib-throughput-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="track" aria-hidden="true">
      <div class="fill" [style.width.%]="fillPercent()"></div>
    </div>
    <span class="reading">{{ reading() }} / {{ capacityMbps() }} Mbps</span>
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .track {
      flex: 0 0 80px;
      height: var(--space-2);
      background: var(--divider);
      border-radius: var(--radius);
      overflow: hidden;
    }

    .fill {
      height: 100%;
      background: var(--accent);
    }

    .reading {
      font-family: var(--font-family-mono);
      font-size: var(--font-size-small);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
  `,
})
export class ThroughputBar {
  readonly throughputMbps = input.required<number | null>();
  readonly capacityMbps = input.required<number>();

  /** Whole Mbps: a hundredth of a megabit is precision an operator cannot use. */
  protected readonly reading = computed(() => {
    const throughput = this.throughputMbps();

    return throughput === null ? '—' : String(Math.round(throughput));
  });

  protected readonly fillPercent = computed(() => {
    const throughput = this.throughputMbps();
    const capacity = this.capacityMbps();

    if (throughput === null || capacity <= 0) {
      return 0;
    }

    // Clamped, so a Link reporting above its provisioned Capacity overflows
    // the number rather than the bar.
    return Math.min(100, (throughput / capacity) * 100);
  });
}
