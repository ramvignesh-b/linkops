import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  FleetBreadcrumb,
  LinkConflict,
  LinkForm,
  operatorMessageFor,
  toLinkCreate,
  type LinkFormMode,
} from '@linkops/console/ui';
import {
  apiErrorEnvelopeSchema,
  type ApiErrorBody,
  type FieldIssue,
  type Link,
  type LinkCreate,
} from '@linkops/shared/domain';
import { isNotFoundError } from './is-not-found';

/**
 * The differing pair a `LINK_VERSION_CONFLICT` renders: the operator's own
 * patch, and the Link the Server holds now.
 */
interface Conflict {
  readonly mine: LinkCreate;
  readonly theirs: Link;
}

/**
 * Mounted at `/links/:id/edit`, its own top-level route rather than a child
 * of `/links/:id` — so `:id` binds directly rather than through the
 * inheritance a path-bearing child route needs opted into.
 *
 * The Link is read fresh over REST on entry, the same choice
 * `LinkDetailPage` makes and for the same reason: a form pre-filled from the
 * store could be pre-filled from a Link already gone, and this route's PATCH
 * needs the Server's own `version` to open a conflict against, not a Roster
 * copy that could already be stale before the first keystroke.
 *
 * The version submitted moves with every conflict: a fresh read seeds it,
 * `LINK_VERSION_CONFLICT`'s `current` bumps it, and "keep mine" resubmits the
 * operator's own patch against whatever version is current at that moment —
 * never a stale one, and never a retry the operator did not choose.
 */
@Component({
  selector: 'lib-link-edit-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FleetBreadcrumb, LinkConflict, LinkForm],
  template: `
    <lib-fleet-breadcrumb />

    <h1>Edit Link</h1>

    @if (notFound()) {
      <div class="not-found">
        <p>This Link no longer exists.</p>
      </div>
    } @else if (loadUnreachable()) {
      <p class="unreachable">
        The Server did not answer. Nothing can be edited until it does.
      </p>
    } @else if (mode(); as formMode) {
      @if (conflict(); as active) {
        <lib-link-conflict
          [mine]="active.mine"
          [theirs]="active.theirs"
          (takeTheirs)="onTakeTheirs()"
          (keepMine)="onKeepMine()"
        />
      } @else {
        @if (unreachable()) {
          <p class="unreachable">
            The Server did not answer. Nothing was saved — try again.
          </p>
        }
        <lib-link-form
          [mode]="formMode"
          [serverIssues]="issues()"
          [pending]="pending()"
          (submitted)="onSubmit($event)"
        />
      }
    } @else {
      <p class="loading">Loading Link…</p>
    }
  `,
  styles: `
    h1 {
      margin: 0 0 var(--space-3);
      font-family: var(--font-family-heading);
      font-size: var(--font-size-heading);
      font-weight: var(--font-weight-strong);
    }

    .unreachable {
      margin: 0 0 var(--space-3);
      color: var(--status-down);
    }

    .not-found {
      color: var(--text-muted);
    }
  `,
})
export class LinkEditPage {
  readonly id = input.required<string>();

  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  protected readonly mode = signal<LinkFormMode | null>(null);
  protected readonly conflict = signal<Conflict | null>(null);
  protected readonly issues = signal<readonly FieldIssue[]>([]);
  protected readonly pending = signal(false);
  /** A Transport Failure resolving the patch — distinct from `loadUnreachable`. */
  protected readonly unreachable = signal(false);
  protected readonly loadUnreachable = signal(false);
  protected readonly notFound = signal(false);

  /** The version the next PATCH carries — moved by every conflict, never by a retry. */
  private version: number | null = null;
  /** The operator's last client-validated patch, held for "keep mine" to resubmit. */
  private pendingPatch: LinkCreate | null = null;

  constructor() {
    effect(() => {
      const id = this.id();

      // The route reuses this component instance across a same-config
      // `:id` change, the way `LinkDetailPage`'s route does — so every state
      // a previous Link left behind is cleared before the new one is asked
      // for, rather than surviving under the new id.
      this.mode.set(null);
      this.conflict.set(null);
      this.issues.set([]);
      this.pending.set(false);
      this.unreachable.set(false);
      this.loadUnreachable.set(false);
      this.notFound.set(false);
      this.version = null;
      this.pendingPatch = null;

      this.http.get<{ link: Link }>(`/api/links/${id}`).subscribe({
        next: ({ link }) => {
          this.version = link.version;
          this.mode.set({ kind: 'edit', link });
        },
        error: (cause: unknown) => {
          if (isNotFoundError(cause)) {
            this.notFound.set(true);
          } else {
            this.loadUnreachable.set(true);
          }
        },
      });
    });
  }

  protected onSubmit(value: LinkCreate): void {
    this.submitPatch(value);
  }

  protected onTakeTheirs(): void {
    const active = this.conflict();
    if (active === null) return;

    // A fresh `edit` mode is what re-seeds `LinkForm`'s value — its own
    // effect does the repaint, so nothing here touches the form directly.
    this.mode.set({ kind: 'edit', link: active.theirs });
    this.version = active.theirs.version;
    this.pendingPatch = null;
    this.conflict.set(null);
  }

  protected onKeepMine(): void {
    const active = this.conflict();
    if (active === null) return;

    // The conflict view going away recreates `LinkForm` (it sits behind an
    // `@if`/`@else` on `conflict()`, the same as `LinkDetailPage`'s own
    // toggled sections), and a fresh instance repaints from `mode` — so
    // `mode` moves to the operator's own patch here, not just `theirs`.
    // Otherwise a resubmission that itself fails for a reason other than
    // another conflict would show the pristine Link this route first loaded.
    this.mode.set({ kind: 'edit', link: { ...active.theirs, ...active.mine } });
    this.conflict.set(null);
    this.submitPatch(active.mine);
  }

  private submitPatch(value: LinkCreate): void {
    this.pendingPatch = value;
    this.issues.set([]);
    this.unreachable.set(false);
    this.pending.set(true);

    const id = this.id();
    this.http
      .patch<Link>(`/api/links/${id}`, { ...value, version: this.version })
      .subscribe({
        next: (link) => {
          this.pending.set(false);
          this.router.navigate(['/links', link.id]);
        },
        error: (cause: unknown) => {
          this.pending.set(false);
          this.issues.set(this.issuesFrom(cause));
        },
      });
  }

  private issuesFrom(cause: unknown): FieldIssue[] {
    if (!(cause instanceof HttpErrorResponse)) {
      this.unreachable.set(true);

      return [];
    }

    const parsed = apiErrorEnvelopeSchema.safeParse(cause.error);
    if (!parsed.success) {
      this.unreachable.set(true);

      return [];
    }

    return this.fieldIssuesFor(parsed.data.error);
  }

  private fieldIssuesFor(error: ApiErrorBody): FieldIssue[] {
    switch (error.code) {
      case 'VALIDATION_FAILED':
        return error.details.issues;
      case 'LINK_NAME_TAKEN':
        return [{ path: 'name', message: operatorMessageFor(error.code) }];
      case 'LINK_VERSION_CONFLICT': {
        // `details.current` is already typed `Link` by the discriminated
        // union on `code` — no cast at this call site.
        const theirs = error.details.current;
        this.version = theirs.version;
        this.conflict.set({
          mine: this.pendingPatch ?? toLinkCreate(theirs),
          theirs,
        });

        return [];
      }
      case 'LINK_NOT_FOUND':
        // Someone else deleted it while this operator was editing.
        this.notFound.set(true);

        return [];
      case 'A2UI_INVALID_PAYLOAD':
        // `PATCH /api/links/:id` never produces this per its documented
        // responses — handled rather than assumed, so a Server contract
        // change surfaces as a visible failure instead of a silent drop.
        this.unreachable.set(true);

        return [];
    }
  }
}
