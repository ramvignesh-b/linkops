import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * What an operator sees when the stream drops, and the reason the stall is
 * safe to look at: it names how old the screen is instead of letting still
 * numbers speak for themselves. A Stall — the stream stopping while everything
 * still looks connected — is worse than a disconnect precisely because nothing
 * says so, and this is the sentence that says so.
 *
 * Renders nothing while the stream is live. `lastFrameAt` is the Server's own
 * timestamp for the last good frame, shown in the operator's local time; the
 * ISO value stays on the `<time>` element, where it is exact.
 */
@Component({
  selector: 'lib-connection-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
  template: `
    @if (dropped()) {
      <p role="alert">
        <strong>Connection lost.</strong> Every Link below is frozen at its last
        known reading — nothing here is live, and no Status has been changed to
        say otherwise.
        @if (lastFrameAt(); as at) {
          Last good frame at
          <time [attr.datetime]="at">{{ at | date: 'HH:mm:ss' }}</time
          >.
        } @else {
          No frame has arrived yet.
        }
      </p>
    }
  `,
  styles: `
    p {
      margin: 0;
      padding: var(--space-2) var(--space-3);
      background: var(--surface-raised);
      border: 1px solid var(--status-down);
      border-radius: var(--radius);
      color: var(--text-primary);
    }

    strong {
      color: var(--status-down);
      font-weight: var(--font-weight-strong);
    }
  `,
})
export class ConnectionBanner {
  readonly dropped = input.required<boolean>();
  readonly lastFrameAt = input.required<string | null>();
}
