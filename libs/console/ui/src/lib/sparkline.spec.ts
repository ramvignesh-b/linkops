import { Component } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { toLinkId, type TelemetrySample } from '@linkops/shared/domain';
import {
  buildSparklinePath,
  capacityLineY,
  Sparkline,
  SPARKLINE_HEIGHT,
  SPARKLINE_WIDTH,
} from './sparkline';

const LINK_ID = toLinkId('lnk_alpha');

/** A ten-second axis, so a Sample's X coordinate is readable by hand. */
const WINDOW_MS = 10_000;
const SIZE = {
  width: SPARKLINE_WIDTH,
  height: SPARKLINE_HEIGHT,
  windowMs: WINDOW_MS,
};

function sample(
  ts: string,
  throughputMbps: number,
  snrDb = 24,
  rssiDbm = -55,
): TelemetrySample {
  return {
    linkId: LINK_ID,
    ts,
    throughputMbps,
    snrDb,
    rssiDbm,
  };
}

describe('buildSparklinePath', () => {
  it('returns empty string for empty samples', () => {
    expect(buildSparklinePath([], 100, SIZE)).toBe('');
  });

  it('anchors a single sample at the right edge rather than stretching it', () => {
    const samples = [sample('2026-08-16T10:00:00.000Z', 50)];
    const path = buildSparklinePath(samples, 100, SIZE);
    // x=300: the newest Sample is *now*, and the ten seconds behind it are
    // empty rather than filled by one point stretched across the chart.
    // y=36: half of Capacity against an axis topping out at 125 Mbps.
    expect(path).toBe('M 300 36');
  });

  it('connects consecutive samples within 2 seconds using L commands', () => {
    const samples = [
      sample('2026-08-16T10:00:00.000Z', 0),
      sample('2026-08-16T10:00:01.000Z', 50),
      sample('2026-08-16T10:00:02.000Z', 100),
    ];
    const path = buildSparklinePath(samples, 100, SIZE);
    // Three seconds of a ten-second axis: the last tenth of the width per
    // second. 0 Mbps -> y=60 (the floor), 100 Mbps -> the Capacity line at 12.
    expect(path).toBe('M 240 60 L 270 36 L 300 12');
  });

  it('drops samples older than the window rather than compressing them in', () => {
    const samples = [
      sample('2026-08-16T09:59:00.000Z', 90),
      sample('2026-08-16T10:00:00.000Z', 50),
    ];
    const path = buildSparklinePath(samples, 100, SIZE);
    // The minute-old Sample is off the ten-second axis, not squeezed onto it.
    expect(path).toBe('M 300 36');
  });

  it('starts a new subpath with M whenever consecutive samples are more than two Ticks apart', () => {
    const samples = [
      sample('2026-08-16T10:00:00.000Z', 20),
      sample('2026-08-16T10:00:01.000Z', 40),
      // 5-second gap (> 2000 ms)
      sample('2026-08-16T10:00:06.000Z', 60),
      sample('2026-08-16T10:00:07.000Z', 80),
    ];
    const path = buildSparklinePath(samples, 100, SIZE);
    const subpaths = path.split('M').filter(Boolean);
    expect(subpaths.length).toBe(2);
    // The break spans the five seconds it actually lasted: x 120 to x 270.
    expect(path).toContain('L 120 40.8 M 270 31.2');
  });

  it('joins samples exactly two Ticks apart rather than breaking them', () => {
    const samples = [
      sample('2026-08-16T10:00:00.000Z', 20),
      sample('2026-08-16T10:00:02.000Z', 40),
    ];
    const path = buildSparklinePath(samples, 100, SIZE);
    // One missed Tick is a 1 Hz producer's jitter, not a gap.
    expect(path.match(/M/g)?.length).toBe(1);
  });

  it('draws throughput above capacity above the capacity line, not on it', () => {
    const atCapacity = buildSparklinePath(
      [sample('2026-08-16T10:00:00.000Z', 100)],
      100,
      SIZE,
    );
    const overCapacity = buildSparklinePath(
      [sample('2026-08-16T10:00:00.000Z', 115)],
      100,
      SIZE,
    );

    expect(atCapacity).toBe(`M 300 ${capacityLineY(SIZE.height)}`);
    expect(overCapacity).not.toBe(atCapacity);
    // Higher throughput sits nearer the top of the viewBox.
    expect(Number(overCapacity.split(' ')[2])).toBeLessThan(
      capacityLineY(SIZE.height),
    );
  });

  it('clamps throughput beyond the axis headroom to the top of the chart', () => {
    const samples = [sample('2026-08-16T10:00:00.000Z', 500)];
    expect(buildSparklinePath(samples, 100, SIZE)).toBe('M 300 0');
  });
});

@Component({
  imports: [Sparkline],
  template: `
    <lib-sparkline
      [samples]="samples"
      [capacityMbps]="capacityMbps"
      [windowMs]="windowMs"
    />
  `,
})
class TestHost {
  samples: TelemetrySample[] = [];
  capacityMbps = 100;
  windowMs = WINDOW_MS;
}

describe('Sparkline', () => {
  let fixture: ComponentFixture<TestHost>;
  let host: TestHost;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHost],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHost);
    host = fixture.componentInstance;
  });

  it('renders svg path matching the computed sparkline path', () => {
    host.samples = [
      sample('2026-08-16T10:00:00.000Z', 25),
      sample('2026-08-16T10:00:01.000Z', 75),
    ];
    host.capacityMbps = 100;
    fixture.detectChanges();

    const path = fixture.nativeElement.querySelector('svg path.sparkline-path');
    expect(path).not.toBeNull();
    const d = path.getAttribute('d');
    expect(d).toContain('M 270');
    expect(d).toContain('L 300');
  });

  it('draws the capacity reference line inside the viewBox', () => {
    host.samples = [sample('2026-08-16T10:00:00.000Z', 25)];
    fixture.detectChanges();

    const line = fixture.nativeElement.querySelector('line.capacity-line');
    const y = Number(line.getAttribute('y1'));
    // Not the top edge: a line at y=0 loses half its stroke to the clip.
    expect(y).toBe(capacityLineY(SPARKLINE_HEIGHT));
    expect(y).toBeGreaterThan(0);
  });

  it('renders scale labels and time axis measurements', () => {
    host.samples = [sample('2026-08-16T10:00:00.000Z', 25)];
    host.capacityMbps = 100;
    fixture.detectChanges();

    const yAxis = fixture.nativeElement.querySelector('.y-axis');
    expect(yAxis).not.toBeNull();
    expect(yAxis.textContent).toContain('100M');
    expect(yAxis.textContent).toContain('50M');
    expect(yAxis.textContent).toContain('0');

    const timeAxis = fixture.nativeElement.querySelector('.time-axis');
    expect(timeAxis).not.toBeNull();
    expect(timeAxis.textContent).toContain('Now');
  });

  it('renders empty indicator when no samples exist', () => {
    host.samples = [];
    fixture.detectChanges();

    const empty = fixture.nativeElement.querySelector('.sparkline-empty');
    expect(empty).not.toBeNull();
    expect(empty.textContent).toContain('No telemetry history');
  });
});
