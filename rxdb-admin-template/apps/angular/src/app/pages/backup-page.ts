import { useRxDB } from '@aiao/rxdb-angular';
import { useI18n } from '@aiao/rxdb-i18n-angular';
import { Component } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { BackupController, restoreFailureMessage } from '../backup/backup-controller';
import { backupErrorMessage } from '../backup/backup-ops';
@Component({
  selector: 'app-backup-page',
  imports: [RouterLink],
  template: ` @let value = state();
    @let backup = value.backup;
    @let restore = value.restore;
    <div class="page-host gap-4 overflow-auto p-6" [attr.aria-busy]="value.busy">
      <h2 class="text-base font-semibold">{{ t('backup.title') }}</h2>
      <section class="bg-base-200 rounded-box flex flex-col gap-2 p-4">
        <p class="text-sm opacity-80">{{ t('backup.description') }}</p>
        <button
          class="btn btn-primary w-fit"
          [disabled]="value.busy"
          (click)="controller.backup()"
          data-testid="backup-start"
        >
          @if (backup.kind === 'running') {
            <span class="loading loading-spinner loading-sm"></span>{{ t('backup.running') }}
          } @else {
            {{ t('backup.download') }}
          }
        </button>
        <div data-testid="backup-result">
          @if (backup.kind === 'success') {
            <span class="text-success">{{
              t('backup.success', { bytes: formatNumber(backup.bytes), sha256: backup.sha256 })
            }}</span>
          }
          @if (backup.kind === 'failed') {
            <span class="text-error" role="alert">{{ backupErrorMessage(backup.error, t) }}</span>
          }
        </div>
      </section>
      <h2 class="text-base font-semibold">{{ t('backup.restoreTitle') }}</h2>
      <section class="bg-base-200 rounded-box flex flex-col gap-2 p-4">
        <p class="text-sm opacity-80">{{ t('backup.restoreDescription') }}</p>
        <input
          class="file-input file-input-bordered w-full max-w-sm"
          [attr.aria-label]="t('backup.selectArchive')"
          [disabled]="value.busy"
          (change)="restoreFile($event)"
          data-testid="restore-input"
          type="file"
        />
        <div data-testid="restore-result">
          @if (restore.kind === 'running') {
            <span><span class="loading loading-spinner loading-sm"></span>{{ t('backup.processing') }}</span>
          }
          @if (restore.kind === 'success') {
            <span class="text-success"
              >{{ t('backup.restored', { sha256: restore.sha256 })
              }}<a class="link" routerLink="/entities">{{ t('backup.continue') }}</a></span
            >
          }
          @if (restore.kind === 'failed') {
            <span class="text-error" role="alert">{{ restoreFailureMessage(restore.failure, t) }}</span>
          }
        </div>
        @if (restore.kind === 'failed' && restore.needsCleanup) {
          <button
            class="btn btn-outline btn-warning w-fit"
            [disabled]="value.busy"
            (click)="controller.cleanup()"
            data-testid="restore-cleanup"
          >
            {{ t('backup.cleanup') }}
          </button>
        }
      </section>
    </div>`
})
export default class BackupPage {
  private readonly i18n = useI18n();
  readonly t = this.i18n.t;
  readonly formatNumber = this.i18n.formatNumber;
  readonly controller = new BackupController(useRxDB(), this.i18n);
  readonly state = toSignal(this.controller.state, { requireSync: true });
  readonly backupErrorMessage = backupErrorMessage;
  readonly restoreFailureMessage = restoreFailureMessage;
  restoreFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    void this.controller.restore(file);
  }
}
