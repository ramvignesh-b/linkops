import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import {
  linkCreateSchema,
  type Link,
  type LinkCreate,
} from '@linkops/shared/domain';

/** The eight editable fields, read off the schema rather than restated. */
const EDITABLE_FIELDS = linkCreateSchema.keyof().options;

const FIELD_LABEL: Record<keyof LinkCreate, string> = {
  name: 'Name',
  siteA: 'Site A',
  siteB: 'Site B',
  band: 'Band',
  mode: 'Mode',
  capacityMbps: 'Capacity (Mbps)',
  txPowerDbm: 'Tx Power (dBm)',
  channelWidthMhz: 'Channel Width (MHz)',
};

export interface FieldDifference {
  readonly path: keyof LinkCreate;
  readonly label: string;
  readonly mine: string;
  readonly theirs: string;
}

/**
 * Which of the eight editable fields disagree between the value an operator
 * was typing and the Link the Server holds now — theirs coming from a
 * `LINK_VERSION_CONFLICT` envelope's `details.current`, typed already, so
 * this never sees a cast. Only `linkCreateSchema`'s fields are ever compared:
 * `status`, `version` and the timestamps live on `theirs` but are not in that
 * list, so a Status transition or a bump from someone else's edit can never
 * itself read as a conflict here.
 */
export function diffEditableFields(
  mine: LinkCreate,
  theirs: Link,
): FieldDifference[] {
  return EDITABLE_FIELDS.filter((field) => mine[field] !== theirs[field]).map(
    (field) => ({
      path: field,
      label: FIELD_LABEL[field],
      mine: String(mine[field]),
      theirs: String(theirs[field]),
    }),
  );
}

/**
 * The field-level comparison a version conflict renders instead of a toast:
 * every editable field that disagrees, mine beside theirs, with the two
 * resolutions the ticket calls for. Presentational and pure over its inputs —
 * `diffEditableFields` is the part worth testing carefully, and this
 * component is exercised end-to-end through the Console application rather
 * than in isolation, the same seam every other routed screen in this library
 * is tested at.
 */
@Component({
  selector: 'lib-link-conflict',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="conflict">
      <p class="conflict-message">
        Someone else changed this Link since you opened it. Here's what differs:
      </p>
      <table class="diff-table">
        <thead>
          <tr>
            <th scope="col">Field</th>
            <th scope="col">Yours</th>
            <th scope="col">Theirs</th>
          </tr>
        </thead>
        <tbody>
          @for (difference of differences(); track difference.path) {
            <tr [attr.data-field]="difference.path">
              <th scope="row">{{ difference.label }}</th>
              <td class="mine-value">{{ difference.mine }}</td>
              <td class="theirs-value">{{ difference.theirs }}</td>
            </tr>
          }
        </tbody>
      </table>
      <div class="conflict-actions">
        <button type="button" class="take-theirs" (click)="takeTheirs.emit()">
          Take theirs
        </button>
        <button type="button" class="keep-mine" (click)="keepMine.emit()">
          Keep mine
        </button>
      </div>
    </div>
  `,
  styles: `
    .conflict {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .conflict-message {
      margin: 0;
      color: var(--text-muted);
    }

    .diff-table {
      border-collapse: collapse;
      width: 100%;
      max-width: 480px;
    }

    .diff-table th,
    .diff-table td {
      text-align: left;
      padding: var(--space-1) var(--space-2);
      border-bottom: 1px solid var(--divider);
    }

    .conflict-actions {
      display: flex;
      gap: var(--space-2);
    }

    .conflict-actions button {
      padding: var(--space-2) var(--space-3);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      font-weight: var(--font-weight-medium);
      cursor: pointer;
    }

    .take-theirs {
      background: var(--surface-raised);
      color: var(--text-primary);
    }

    .keep-mine {
      background: var(--accent);
      color: var(--surface-raised);
      border-color: var(--accent);
    }
  `,
})
export class LinkConflict {
  readonly mine = input.required<LinkCreate>();
  readonly theirs = input.required<Link>();

  /** Replaces the form's values with `theirs` and clears the conflict. */
  readonly takeTheirs = output<void>();
  /** Resubmits `mine` carrying `theirs`'s version. */
  readonly keepMine = output<void>();

  protected readonly differences = computed(() =>
    diffEditableFields(this.mine(), this.theirs()),
  );
}
