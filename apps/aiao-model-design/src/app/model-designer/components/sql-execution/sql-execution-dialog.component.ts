import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CircleAlert, CircleCheck, DatabaseZap, LoaderCircle, LucideAngularModule, RotateCcw, X } from 'lucide-angular';
import { MODEL_DESIGNER_TRANSLATIONS } from '../../i18n/translations';
import { SqlExecutionService } from '../../services/sql-execution.service';

/** Immutable SQL payload captured when the execution dialog opens. */
export interface SqlExecutionDialogData {
  readonly sql: string;
}

/** Displays rollback-only preflight impact and executes the confirmed SQL snapshot. */
@Component({
  selector: 'lib-sql-execution-dialog',
  standalone: true,
  imports: [LucideAngularModule],
  templateUrl: './sql-execution-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SqlExecutionDialogComponent {
  readonly #data = inject<SqlExecutionDialogData>(DIALOG_DATA);
  readonly #dialogRef = inject(DialogRef<void>);
  readonly #execution = inject(SqlExecutionService);

  protected readonly t = inject(MODEL_DESIGNER_TRANSLATIONS);
  protected readonly state = this.#execution.state;
  protected readonly busy = computed(() => {
    const phase = this.state().phase;
    return phase === 'preflighting' || phase === 'executing';
  });
  protected readonly CircleAlert = CircleAlert;
  protected readonly CircleCheck = CircleCheck;
  protected readonly DatabaseZap = DatabaseZap;
  protected readonly LoaderCircle = LoaderCircle;
  protected readonly RotateCcw = RotateCcw;
  protected readonly X = X;

  constructor() {
    void this.#execution.preflight(this.#data.sql);
  }

  async onExecute(confirmDestructive = false): Promise<void> {
    await this.#execution.execute(confirmDestructive);
  }

  async onRetry(confirmDestructive = false): Promise<void> {
    await this.#execution.retry(confirmDestructive);
  }

  onClose(): void {
    if (this.busy()) return;
    this.#execution.reset();
    this.#dialogRef.close();
  }
}
