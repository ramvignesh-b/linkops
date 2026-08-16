import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FleetStore } from '@linkops/console/data-access';
import { ConnectionBanner } from '@linkops/console/ui';

/**
 * The shell: a header, the connection banner, and the routed view.
 *
 * Injecting the store here is what starts the Console's connection to the
 * Server — the shell outlives every route, so the stream is opened once at boot
 * and closed when the application is destroyed, rather than being reopened on
 * every navigation. The banner lives here for the same reason: a dropped stream
 * freezes whichever screen the operator happens to be on.
 */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ConnectionBanner, RouterOutlet],
  template: `
    <header>
      <h1>LinkOps</h1>
    </header>
    <main>
      <lib-connection-banner
        [dropped]="dropped()"
        [lastFrameAt]="lastFrameAt()"
      />
      <router-outlet />
    </main>
  `,
  styles: `
    header {
      padding: var(--space-3) var(--space-4);
      background: var(--surface-raised);
      border-bottom: 1px solid var(--border);
    }

    h1 {
      margin: 0;
      font-size: var(--font-size-heading);
      font-weight: var(--font-weight-strong);
    }

    main {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      /* A fixed desktop layout: an operator console served next to the device
         it manages is used on a desktop, so there are no breakpoints. */
      max-width: 1100px;
      padding: var(--space-4);
    }
  `,
})
export class App {
  private readonly connection = inject(FleetStore).connection;

  protected readonly dropped = computed(
    () => this.connection().kind === 'dropped',
  );

  protected readonly lastFrameAt = computed(() => {
    const connection = this.connection();

    return connection.kind === 'connecting' ? null : connection.lastFrameAt;
  });
}
