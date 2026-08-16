import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import type { LinkStatus } from '@linkops/shared/domain';

/**
 * A Link's Status, as the Server derived it — the one place the three-way
 * vocabulary becomes colour and words.
 *
 * Three colours, never four. A `down` Link's reason is distinguished by
 * **label**: `stale` and `metrics` answer *why* a Link is down, not *how bad*
 * it is, and giving the reason its own colour would tell an operator there are
 * four severities when there are three.
 *
 * The words are the Console's, not the Server's. `stale` means the feed has
 * gone silent and `metrics` means the signal is bad — one sends an operator to
 * the telemetry path and the other to the radio, which is a distinction worth
 * spelling out rather than passing through as a wire value.
 */
@Component({
  selector: 'lib-status-pill',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="pill" [class]="'pill-' + status().status">{{
    label()
  }}</span>`,
  styles: `
    .pill {
      display: inline-block;
      padding: var(--space-1) var(--space-2);
      border: 1px solid currentColor;
      border-radius: var(--radius);
      font-size: var(--font-size-small);
      font-weight: var(--font-weight-strong);
      white-space: nowrap;
    }

    .pill-up {
      color: var(--status-up);
    }

    .pill-degraded {
      color: var(--status-degraded);
    }

    .pill-down {
      color: var(--status-down);
    }
  `,
})
export class StatusPill {
  readonly status = input.required<LinkStatus>();

  protected readonly label = computed(() => {
    const status = this.status();

    if (status.status !== 'down') {
      return status.status;
    }

    return status.reason === 'stale'
      ? 'down · no telemetry'
      : 'down · poor signal';
  });
}
