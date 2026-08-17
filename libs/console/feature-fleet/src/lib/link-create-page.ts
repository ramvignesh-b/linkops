import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  FleetBreadcrumb,
  LinkForm,
  operatorMessageFor,
  type LinkFormMode,
} from '@linkops/console/ui';
import {
  apiErrorEnvelopeSchema,
  type ApiErrorBody,
  type FieldIssue,
  type Link,
  type LinkCreate,
} from '@linkops/shared/domain';

/**
 * Mounted at `/links/new`, opened from the Fleet header's "New link" action.
 * `LinkForm` runs client-side validation and only ever emits a value that
 * already passed it; this page's only jobs are the POST, turning a Server
 * rejection into the same `FieldIssue[]` shape `LinkForm` already renders
 * client issues from, and navigating to the new Link on success.
 */
@Component({
  selector: 'lib-link-create-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FleetBreadcrumb, LinkForm],
  template: `
    <lib-fleet-breadcrumb />

    <h1>New Link</h1>

    @if (unreachable()) {
      <p class="unreachable">
        The Server did not answer. Nothing was created — try again.
      </p>
    }

    <lib-link-form
      [mode]="mode"
      [serverIssues]="issues()"
      [pending]="pending()"
      cancelLink="/links"
      (submitted)="onSubmit($event)"
    />
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
      padding: var(--space-2) var(--space-3);
      background: var(--surface-raised);
      border: 1px solid var(--status-down);
      border-radius: var(--radius);
      color: var(--status-down);
      font-weight: var(--font-weight-medium);
    }
  `,
})
export class LinkCreatePage {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  protected readonly mode: LinkFormMode = { kind: 'create' };
  protected readonly issues = signal<readonly FieldIssue[]>([]);
  protected readonly pending = signal(false);
  protected readonly unreachable = signal(false);

  protected onSubmit(value: LinkCreate): void {
    this.issues.set([]);
    this.unreachable.set(false);
    this.pending.set(true);

    this.http.post<Link>('/api/links', value).subscribe({
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

  /**
   * A Server rejection, turned into the same `FieldIssue[]` shape `LinkForm`
   * already renders client-side issues from — one adapter, not two that can
   * disagree about where an error lands. `VALIDATION_FAILED`'s `details.issues`
   * is already that shape; `LINK_NAME_TAKEN` becomes one, landing on `name`
   * with operator copy rather than the Server's diagnostic `message`, which
   * never reaches here.
   */
  private issuesFrom(cause: unknown): FieldIssue[] {
    if (!(cause instanceof HttpErrorResponse)) {
      this.unreachable.set(true);

      return [];
    }

    const parsed = apiErrorEnvelopeSchema.safeParse(cause.error);
    if (!parsed.success) {
      // The Server did not answer with its own envelope — offline, a
      // timeout, a proxy's 502 — a Transport Failure, not a field problem.
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
      case 'LINK_NOT_FOUND':
      case 'LINK_VERSION_CONFLICT':
      case 'A2UI_INVALID_PAYLOAD':
        // `POST /api/links` never produces these per its own documented
        // responses — handled rather than assumed, so a Server contract
        // change surfaces as a visible failure instead of a silent drop.
        this.unreachable.set(true);

        return [];
    }
  }
}
