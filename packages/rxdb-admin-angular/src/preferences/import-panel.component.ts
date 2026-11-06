import { ChangeDetectionStrategy, Component, output, signal } from '@angular/core';
import { injectAdminShell, injectAdminText } from '../context';

/**
 * 导入配置面板：粘贴 JSON 后应用；JSON 非法时提示并保持当前设置。
 */
@Component({
  selector: 'rxdb-admin-import-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <div class="flex flex-col gap-2" data-testid="pref-import-panel">
      <textarea
        class="textarea textarea-sm h-28 w-full font-mono"
        [attr.aria-label]="t('prefs.import')"
        [attr.placeholder]="t('prefs.import.placeholder')"
        [value]="text()"
        (input)="onInput($event)"
        data-testid="pref-import-text"
      ></textarea>
      @if (error()) {
        <p class="text-error text-sm" [textContent]="t('prefs.import.invalid')" role="alert"></p>
      }
      <div class="flex justify-end gap-2">
        <button
          class="btn btn-ghost btn-sm"
          [textContent]="t('prefs.import.cancel')"
          (click)="done.emit()"
          type="button"
        ></button>
        <button
          class="btn btn-primary btn-sm"
          [textContent]="t('prefs.import.apply')"
          (click)="apply()"
          data-testid="pref-import-apply"
          type="button"
        ></button>
      </div>
    </div>
  `
})
export class AdminImportPanelComponent {
  protected readonly shell = injectAdminShell();
  protected readonly t = injectAdminText();
  protected readonly text = signal('');
  protected readonly error = signal(false);

  /** 导入成功或取消，面板应当收起。 */
  readonly done = output<void>();

  protected onInput(event: Event): void {
    this.text.set((event.target as HTMLTextAreaElement).value);
    this.error.set(false);
  }

  protected apply(): void {
    if (this.shell.preferences.importJson(this.text()).ok) this.done.emit();
    else this.error.set(true);
  }
}
