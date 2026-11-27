import { useI18n } from '@aiao/rxdb-i18n-angular';
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
    <div [attr.aria-label]="i18n.t('apps.diskutil.firstAid')" appFocusTrap aria-modal="true" role="dialog">
      <h2 style="font-size: 15px; margin: 0 0 10px">{{ i18n.t('apps.diskutil.firstAid') }}</h2>
      <p style="font-size: 12px">{{ i18n.t('apps.diskutil.firstAidBody') }}</p>
      <pre data-log role="status" style="font-size: 12px; max-height: 180px; overflow: auto; white-space: pre-wrap">{{
        text()
      }}</pre>
      <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px">
        @if (!ran()) {
          <button class="btn pri" [disabled]="busy()" (click)="check()" data-run tabindex="0" type="button">
            {{ i18n.t('apps.diskutil.run') }}
          </button>
        } @else {
          @if (orphans()) {
            <button class="btn" [disabled]="busy()" (click)="check(true)" tabindex="0" type="button">
              {{ i18n.t('apps.diskutil.repairOrphans') }}
            </button>
          }
          <button class="btn" [disabled]="busy()" (click)="check()" tabindex="0" type="button">
            {{ i18n.t('apps.diskutil.checkAgain') }}
          </button>
        }
        <button class="btn pri" [disabled]="busy()" (click)="popover.close()" data-done tabindex="0" type="button">
          {{ i18n.t('apps.diskutil.done') }}
        </button>
      </div>
    </div>
  `
})
export class FirstAidPanel {
  private readonly backup = inject(DesktopBackup);
  protected readonly i18n = useI18n();
  protected readonly popover = inject(PopoverService);
  protected readonly busy = signal(false);
  protected readonly text = signal(this.i18n.t('apps.diskutil.firstAidPrompt'));
  protected readonly ran = signal(false);
  protected readonly result = signal<DesktopStorageAudit | null>(null);
  protected readonly orphans = computed(
    () => (this.result()?.orphanMetaIds.length ?? 0) + (this.result()?.orphanPaths.length ?? 0)
  );

  protected async check(repair = false): Promise<void> {
    this.busy.set(true);
    this.text.set(repair ? this.i18n.t('apps.diskutil.repairing') : this.i18n.t('apps.diskutil.checkingFiles'));
    try {
      const report = await this.backup.check(repair);
      this.result.set(report);
      this.ran.set(true);
      const issues = report.issues.length ? report.issues.join('\n') : this.i18n.t('apps.diskutil.consistent');
      this.text.set(
        `${this.i18n.t('apps.diskutil.checkedSummary', { files: report.files, bytes: report.bytes.toLocaleString() })}\n${issues}\n${this.i18n.t('apps.diskutil.orphanCount', { count: this.orphans() })}\n${report.issues.length ? this.i18n.t('apps.diskutil.errorsFound') : this.i18n.t('apps.diskutil.checkComplete')}`
      );
    } catch (error) {
      this.text.set(this.i18n.t('error.diskutil.checkFailed', { reason: describeDiskError(error) }));
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
    <div [attr.aria-label]="i18n.t('apps.diskutil.eraseMacintoshHd')" appFocusTrap aria-modal="true" role="dialog">
      <div style="width: 52px; height: 52px; margin: 0 auto 10px"><svg appIcon="f-hd"></svg></div>
      <h2 style="font-size: 14px">{{ i18n.t('apps.diskutil.eraseMacintoshHdPrompt') }}</h2>
      <p style="font-size: 12px; color: var(--txt-2)">{{ i18n.t('apps.diskutil.eraseBody') }}</p>
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
          {{ i18n.t('apps.diskutil.cancel') }}
        </button>
        <button class="btn" [disabled]="erasing()" (click)="erase()" data-e style="flex: 1" tabindex="0" type="button">
          {{ erasing() ? i18n.t('apps.diskutil.erasing') : i18n.t('apps.diskutil.erase') }}
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
  protected readonly i18n = useI18n();
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
      this.toast.show(this.i18n.t('error.diskutil.eraseFailed', { reason: describeDiskError(error) }));
    } finally {
      this.erasing.set(false);
    }
  }
}
