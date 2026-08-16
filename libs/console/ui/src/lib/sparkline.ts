import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import type { TelemetrySample } from '@linkops/shared/domain';

/** The Simulator's Tick — one Sample per Link per second. */
const TICK_MS = 1_000;

/**
 * More than two Ticks between consecutive Samples is a gap. One missed Tick is
 * the jitter of a 1 Hz producer; two is telemetry that stopped arriving.
 */
const GAP_THRESHOLD_MS = 2 * TICK_MS;

/**
 * The Y axis tops out a quarter above Capacity rather than at it. Drawing the
 * Capacity line at the very top edge leaves half its stroke outside the
 * viewBox, and clamping at Capacity makes a Link running over its provisioned
 * ceiling indistinguishable from one sitting exactly on it — which is the
 * distinction the chart exists to show.
 */
const AXIS_HEADROOM = 1.25;

/** The path builder's coordinate space, and the `viewBox` the SVG declares. */
export const SPARKLINE_WIDTH = 300;
export const SPARKLINE_HEIGHT = 60;

export interface SparklinePathOptions {
  width: number;
  height: number;
  /**
   * The span the X axis covers, ending at the newest Sample. Fixed rather than
   * fitted to the data: four Samples stretched across a chart headed "the last
   * five minutes" would read as five minutes of steady coverage, which is the
   * same lie as interpolating across a gap. Samples older than the span are
   * outside the chart and are not drawn.
   */
  windowMs: number;
}

/** Where the Capacity reference line sits in a chart of the given height. */
export function capacityLineY(height: number): number {
  return Number((height - height / AXIS_HEADROOM).toFixed(2));
}

/**
 * Throughput to a Y coordinate, with the floor at `height` and Capacity at
 * `capacityLineY`. A Link with no provisioned Capacity has no ceiling to be
 * judged against, so it draws on the floor rather than dividing by zero.
 */
function throughputToY(
  throughputMbps: number,
  capacityMbps: number,
  height: number,
): number {
  if (capacityMbps <= 0) {
    return height;
  }

  const ratio = Math.min(
    1,
    Math.max(0, throughputMbps / (capacityMbps * AXIS_HEADROOM)),
  );

  return Number((height - ratio * height).toFixed(2));
}

/**
 * Builds an SVG path string from a sequence of telemetry samples.
 *
 * Horizontal position (X) is real elapsed time against a fixed `windowMs`
 * ending at the newest Sample, so a gap keeps the width it actually lasted and
 * a short history occupies the part of the chart it actually covers.
 *
 * Consecutive samples within `GAP_THRESHOLD_MS` are joined with line segments
 * (`L`). Whenever consecutive samples are further apart than that, a new
 * subpath is started with a move (`M`) so the gap is rendered as a visible
 * break rather than an interpolated steady line.
 */
export function buildSparklinePath(
  samples: readonly TelemetrySample[],
  capacityMbps: number,
  options: SparklinePathOptions,
): string {
  const { width, height, windowMs } = options;

  const endMs =
    samples.length === 0 ? 0 : Date.parse(samples[samples.length - 1].ts);
  const visible = samples.filter(
    (sample) => endMs - Date.parse(sample.ts) <= windowMs,
  );

  if (visible.length === 0) {
    return '';
  }

  const commands: string[] = [];
  let previousMs: number | null = null;

  for (const sample of visible) {
    const sampleMs = Date.parse(sample.ts);
    // Right-anchored: the newest Sample sits at the right edge and the axis
    // runs back a fixed `windowMs` from there.
    const x = Number(
      (width - ((endMs - sampleMs) / windowMs) * width).toFixed(2),
    );
    const y = throughputToY(sample.throughputMbps, capacityMbps, height);

    const broken =
      previousMs === null || sampleMs - previousMs > GAP_THRESHOLD_MS;
    commands.push(`${broken ? 'M' : 'L'} ${x} ${y}`);
    previousMs = sampleMs;
  }

  return commands.join(' ');
}

/**
 * A hand-rolled SVG sparkline charting Throughput over time against Capacity.
 * Gaps in telemetry are rendered as visible breaks rather than interpolated.
 */
@Component({
  selector: 'lib-sparkline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (samples().length > 0) {
      <div class="sparkline-container">
        <div class="capacity-marker">
          <span>Capacity: {{ capacityMbps() }} Mbps</span>
        </div>
        <svg
          [attr.viewBox]="viewBox"
          preserveAspectRatio="none"
          class="sparkline-svg"
          aria-label="Throughput history sparkline"
        >
          <!-- Capacity ceiling reference line -->
          <line
            x1="0"
            [attr.y1]="capacityY"
            [attr.x2]="width"
            [attr.y2]="capacityY"
            class="capacity-line"
            stroke-dasharray="4 2"
          />
          <path [attr.d]="path()" class="sparkline-path" fill="none" />
        </svg>
      </div>
    } @else {
      <p class="sparkline-empty">No telemetry history</p>
    }
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }

    .sparkline-container {
      position: relative;
      background: var(--surface-raised);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: var(--space-2);
    }

    .capacity-marker {
      display: flex;
      justify-content: flex-end;
      margin-bottom: var(--space-1);
      font-family: var(--font-family-mono);
      font-size: var(--font-size-small);
      color: var(--text-muted);
    }

    .sparkline-svg {
      display: block;
      width: 100%;
      height: 80px;
      overflow: visible;
    }

    .capacity-line {
      stroke: var(--divider);
      stroke-width: 1px;
    }

    .sparkline-path {
      stroke: var(--accent);
      stroke-width: 2px;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .sparkline-empty {
      margin: 0;
      padding: var(--space-3);
      color: var(--text-muted);
      font-size: var(--font-size-small);
      text-align: center;
      background: var(--surface-raised);
      border: 1px dashed var(--border);
      border-radius: var(--radius);
    }
  `,
})
export class Sparkline {
  readonly samples = input.required<readonly TelemetrySample[]>();
  readonly capacityMbps = input.required<number>();
  /** The span the X axis covers — the caller owns how much history it means. */
  readonly windowMs = input.required<number>();

  protected readonly width = SPARKLINE_WIDTH;
  protected readonly viewBox = `0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`;
  protected readonly capacityY = capacityLineY(SPARKLINE_HEIGHT);

  protected readonly path = computed(() =>
    buildSparklinePath(this.samples(), this.capacityMbps(), {
      width: SPARKLINE_WIDTH,
      height: SPARKLINE_HEIGHT,
      windowMs: this.windowMs(),
    }),
  );
}
