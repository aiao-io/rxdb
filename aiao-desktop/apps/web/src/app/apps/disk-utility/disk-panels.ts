import { Component, computed, inject, input, signal } from '@angular/core';

import { DesktopStorageAudit } from '../../data/desktop-storage-audit';
import { DesktopBackup } from '../../services/desktop-backup';
import { FileSystem, describeDiskError } from '../../services/file-system';
import { PopoverService } from '../../services/popover';
import { Session } from '../../services/session';
import { Toast } from '../../services/toast';
import { WindowManager } from '../../services/window-manager';
import { FocusTrap } from '../../shared/focus-trap';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-first-aid-panel',
  imports: [FocusTrap],
  host: { class: 'pop', style: 'width: 400px; padding: 16px' },
  template: `
    <div appFocusTrap aria-label="First Aid" aria-modal="true" role="dialog">
      <h2 style="font-size: 15px; margin: 0 0 10px">First Aid</h2>
      <p style="font-size: 12px">
        Checks the real file tree, metadata, and stored file bodies. Repair removes only unreferenced desktop file
        bodies.
      </p>
      <pre data-log role="status" style="font-size: 12px; max-height: 180px; overflow: auto; white-space: pre-wrap">{{
        text()
      }}</pre>
      <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px">
        @if (!ran()) {
          <button class="btn pri" [disabled]="busy()" (click)="check()" data-run tabindex="0" type="button">Run</button>
        } @else {
          @if (orphans()) {
            <button class="btn" [disabled]="busy()" (click)="check(true)" tabindex="0" type="button">
              Repair Orphan Files
            </button>
          }
          <button class="btn" [disabled]="busy()" (click)="check()" tabindex="0" type="button">Check Again</button>
        }
        <button class="btn pri" [disabled]="busy()" (click)="popover.close()" data-done tabindex="0" type="button">
          Done
        </button>
      </div>
    </div>
  `
})
export class FirstAidPanel {
  private readonly backup = inject(DesktopBackup);
  protected readonly popover = inject(PopoverService);
  protected readonly busy = signal(false);
  protected readonly text = signal('Click Run to check file references and stored bytes.');
  protected readonly ran = signal(false);
  protected readonly result = signal<DesktopStorageAudit | null>(null);
  protected readonly orphans = computed(
    () => (this.result()?.orphanMetaIds.length ?? 0) + (this.result()?.orphanPaths.length ?? 0)
  );

  protected async check(repair = false): Promise<void> {
    this.busy.set(true);
    this.text.set(repair ? 'Repairing unreferenced files…' : 'Checking file references and stored bytes…');
    try {
      const report = await this.backup.check(repair);
      this.result.set(report);
      this.ran.set(true);
      const issues = report.issues.length ? report.issues.join('\n') : 'File references and sizes are consistent.';
      this.text.set(
        `${report.files} files checked; ${report.bytes.toLocaleString()} stored bytes.\n${issues}\n${this.orphans()} unreferenced file bodies.\n${report.issues.length ? 'Errors found. Missing content cannot be recreated; restore a backup.' : 'Check complete.'}`
      );
    } catch (error) {
      this.text.set(`Check failed: ${describeDiskError(error)}`);
    } finally {
      this.busy.set(false);
    }
  }
}

@Component({
  selector: 'app-erase-panel',
  imports: [Icon, FocusTrap],
  host: { class: 'pop', style: 'width: 340px; padding: 16px; text-align: center' },
  template: `
    <div appFocusTrap aria-label="Erase Macintosh HD" aria-modal="true" role="dialog">
      <div style="width: 52px; height: 52px; margin: 0 auto 10px"><svg appIcon="f-hd"></svg></div>
      <h2 style="font-size: 14px">Erase “Macintosh HD”?</h2>
      <p style="font-size: 12px; color: var(--txt-2)">
        Deletes disk files and restores the original files, then restarts the desktop. App records, preferences, remote
        apps, and retained backup copies stay intact. Unsaved documents ask to save or discard before erasing.
      </p>
      <div style="display: flex; gap: 8px">
        <button
          class="btn"
          [disabled]="erasing()"
          (click)="popover.close()"
          data-x
          style="flex: 1"
          tabindex="0"
          type="button"
        >
          Cancel
        </button>
        <button class="btn" [disabled]="erasing()" (click)="erase()" data-e style="flex: 1" tabindex="0" type="button">
          {{ erasing() ? 'Erasing…' : 'Erase' }}
        </button>
      </div>
    </div>
  `
})
export class ErasePanel {
  private readonly toast = inject(Toast);
  private readonly fs = inject(FileSystem);
  private readonly session = inject(Session);
  private readonly windows = inject(WindowManager);
  protected readonly popover = inject(PopoverService);
  protected readonly erasing = signal(false);
  readonly windowId = input.required<string>();

  protected async erase(): Promise<void> {
    this.erasing.set(true);
    this.popover.close(true);
    try {
      if (!(await this.windows.closeOthers(this.windowId()))) return;
      await this.fs.erase();
      this.popover.close();
      this.session.restart(false);
    } catch (error) {
      this.toast.show(`Erase failed: ${describeDiskError(error)}`);
    } finally {
      this.erasing.set(false);
    }
  }
}
