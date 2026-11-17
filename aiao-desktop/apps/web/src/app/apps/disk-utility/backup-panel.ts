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
      <h2 id="desktop-backup-title" style="font-size: 16px; margin: 0 0 8px">Desktop Backup</h2>
      <p style="font-size: 12px; color: var(--txt-2)">
        Includes files, Trash, app records, and desktop preferences. Maximum size: 256 MiB.
      </p>
      <p style="font-size: 12px; color: var(--txt-2)">
        Remote apps, game saves, terminal runtime images, and account credentials are excluded. Keep downloaded backups
        private.
      </p>
      <div style="display: flex; gap: 8px; flex-wrap: wrap">
        <button class="btn" [disabled]="busy()" (click)="exportBackup()" tabindex="0" type="button">
          Export Backup
        </button>
        <label style="display: flex; align-items: center; gap: 8px; font-size: 12px"
          >Choose backup
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
          <b>Restore this backup?</b>
          <p style="font-size: 12px">
            Created {{ info.createdAt }} from {{ info.sourceOrigin }}. Data version {{ info.schema }}.
          </p>
          <p style="font-size: 12px">
            Replaces this desktop after verification and reloads it. Current data stays in a separate retained copy.
            Other open tabs will stop saving. Unsaved documents will ask to save or discard first.
          </p>
          <div style="display: flex; gap: 8px">
            <button class="btn" [disabled]="busy()" (click)="cancel()" tabindex="0" type="button">
              Cancel Restore
            </button>
            <button class="btn pri" [disabled]="busy()" (click)="restore()" tabindex="0" type="button">
              Restore Desktop
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
  protected readonly busy = signal(false);
  protected readonly status = signal('');
  protected readonly error = signal('');
  protected readonly manifest = signal<DesktopBackupManifest | null>(null);

  protected async exportBackup(): Promise<void> {
    await this.perform('Creating a consistent backup…', async () => {
      const blob = await this.backup.export();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `desktop-${new Date().toISOString().slice(0, 10)}.aiao-backup`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      this.status.set(`Backup downloaded (${blob.size.toLocaleString()} bytes). Keep it outside this browser.`);
    });
  }

  protected async choose(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.cancel();
    await this.perform('Validating backup…', async () => {
      if (file.size > MAX_DESKTOP_BACKUP_BYTES) throw new Error('Desktop backups are limited to 256 MiB.');
      const archive = new Blob([await file.arrayBuffer()]);
      const decoded = await this.backup.inspect(archive);
      this.archive = archive;
      this.manifest.set(decoded.manifest);
      this.status.set('Backup verified. Review the replacement before restoring.');
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
    await this.perform('Preparing to restore…', async () => {
      if (!(await this.windows.closeOthers(this.win.id))) {
        this.status.set('Restore cancelled. Your current data is unchanged.');
        return;
      }
      this.status.set('Restoring and verifying a separate copy. Keep this tab open…');
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
