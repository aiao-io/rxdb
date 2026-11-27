import { useI18n } from '@aiao/rxdb-i18n-angular';
import { Component, inject, signal } from '@angular/core';

import { MAX_DESKTOP_BACKUP_BYTES, type DesktopBackupManifest } from '../../data/desktop-backup-archive';
import { DesktopBackup } from '../../services/desktop-backup';
import { DesktopWindow } from '../../services/desktop-window';
import { describeDiskError } from '../../services/file-system';
import { WindowManager } from '../../services/window-manager';

@Component({
  selector: 'app-backup-panel',
  template: `
    <section
      aria-labelledby="desktop-backup-title"
      style="margin-top: 24px; border-top: 1px solid var(--line); padding-top: 16px"
    >
      <h2 id="desktop-backup-title" style="font-size: 16px; margin: 0 0 8px">
        {{ i18n.t('apps.diskutil.desktopBackup') }}
      </h2>
      <p style="font-size: 12px; color: var(--txt-2)">
        {{ i18n.t('apps.diskutil.backupIncludes') }}
      </p>
      <p style="font-size: 12px; color: var(--txt-2)">
        {{ i18n.t('apps.diskutil.backupExcludes') }}
      </p>
      <div style="display: flex; gap: 8px; flex-wrap: wrap">
        <button class="btn" [disabled]="busy()" (click)="exportBackup()" tabindex="0" type="button">
          {{ i18n.t('apps.diskutil.exportBackup') }}
        </button>
        <label style="display: flex; align-items: center; gap: 8px; font-size: 12px"
          >{{ i18n.t('apps.diskutil.chooseBackup') }}
          <input
            [disabled]="busy()"
            (change)="choose($event)"
            accept=".aiao-backup,application/vnd.aiao.desktop-backup"
            type="file"
          />
        </label>
      </div>
      @if (manifest(); as info) {
        <div data-restore-confirm style="margin-top: 12px; padding: 12px; background: var(--win-2); border-radius: 6px">
          <b>{{ i18n.t('apps.diskutil.restoreConfirm') }}</b>
          <p style="font-size: 12px">
            {{
              i18n.t('apps.diskutil.restoreInfo', {
                date: info.createdAt,
                origin: info.sourceOrigin,
                version: info.schema
              })
            }}
          </p>
          <p style="font-size: 12px">
            {{ i18n.t('apps.diskutil.restoreBody') }}
          </p>
          <div style="display: flex; gap: 8px">
            <button class="btn" [disabled]="busy()" (click)="cancel()" tabindex="0" type="button">
              {{ i18n.t('apps.diskutil.cancelRestore') }}
            </button>
            <button class="btn pri" [disabled]="busy()" (click)="restore()" tabindex="0" type="button">
              {{ i18n.t('apps.diskutil.restoreDesktop') }}
            </button>
          </div>
        </div>
      }
      <p aria-live="polite" role="status" style="font-size: 12px; min-height: 18px">{{ status() }}</p>
      @if (error()) {
        <p role="alert" style="font-size: 12px; color: var(--txt)">{{ error() }}</p>
      }
    </section>
  `
})
export class BackupPanel {
  private readonly backup = inject(DesktopBackup);
  private readonly windows = inject(WindowManager);
  private readonly win = inject(DesktopWindow);
  private archive: Blob | null = null;
  protected readonly i18n = useI18n();
  protected readonly busy = signal(false);
  protected readonly status = signal('');
  protected readonly error = signal('');
  protected readonly manifest = signal<DesktopBackupManifest | null>(null);

  protected async exportBackup(): Promise<void> {
    await this.perform(this.i18n.t('apps.diskutil.creatingBackup'), async () => {
      const blob = await this.backup.export();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `desktop-${new Date().toISOString().slice(0, 10)}.aiao-backup`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      this.status.set(this.i18n.t('apps.diskutil.backupDownloaded', { bytes: blob.size.toLocaleString() }));
    });
  }

  protected async choose(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.cancel();
    await this.perform(this.i18n.t('apps.diskutil.validatingBackup'), async () => {
      if (file.size > MAX_DESKTOP_BACKUP_BYTES) throw new Error(this.i18n.t('error.backup.tooLarge'));
      const archive = new Blob([await file.arrayBuffer()]);
      const decoded = await this.backup.inspect(archive);
      this.archive = archive;
      this.manifest.set(decoded.manifest);
      this.status.set(this.i18n.t('apps.diskutil.backupVerified'));
    });
  }

  protected cancel(): void {
    this.archive = null;
    this.manifest.set(null);
    this.status.set('');
    this.error.set('');
  }

  protected async restore(): Promise<void> {
    const archive = this.archive;
    if (!archive) return;
    await this.perform(this.i18n.t('apps.diskutil.preparingRestore'), async () => {
      if (!(await this.windows.closeOthers(this.win.id))) {
        this.status.set(this.i18n.t('apps.diskutil.restoreCancelled'));
        return;
      }
      this.status.set(this.i18n.t('apps.diskutil.restoringCopy'));
      await this.backup.restore(archive);
      location.reload();
    });
  }

  private async perform(message: string, action: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.status.set(message);
    try {
      await action();
    } catch (error) {
      this.status.set('');
      this.error.set(describeDiskError(error));
    } finally {
      this.busy.set(false);
    }
  }
}
