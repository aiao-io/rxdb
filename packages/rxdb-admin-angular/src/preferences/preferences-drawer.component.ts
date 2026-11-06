import type { DrawerRow, PreferenceTab } from '@aiao/rxdb-admin';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { LucideDynamicIcon, LucideX } from '@lucide/angular';
import { injectAdminShell, injectAdminStore, injectAdminText } from '../context';
import { AdminModalDirective, closeOnBackdrop } from '../use-dialog';
import { AdminRowControlComponent, STACKED_KINDS } from './controls.component';
import { AdminImportPanelComponent } from './import-panel.component';

const COPIED_MS = 1500;

/**
 * 偏好抽屉：由 schema 驱动的五个页签，页脚提供重置 / 复制 / 导入配置。
 * 以原生模态 `<dialog>` 呈现，焦点陷阱、Esc 与背景惰性由浏览器负责。
 */
@Component({
  selector: 'rxdb-admin-preferences-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AdminImportPanelComponent, AdminModalDirective, AdminRowControlComponent, LucideDynamicIcon],
  host: { style: 'display: contents' },
  templateUrl: './preferences-drawer.component.html'
})
export class AdminPreferencesDrawerComponent {
  #copiedTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly shell = injectAdminShell();
  protected readonly t = injectAdminText();
  protected readonly ui = injectAdminStore(this.shell.ui);
  protected readonly tabs = injectAdminStore(this.shell.drawer);
  protected readonly hasDiff = injectAdminStore(this.shell.preferences.hasDiff);
  protected readonly active = signal<PreferenceTab>('appearance');
  protected readonly importing = signal(false);
  protected readonly copied = signal(false);
  protected readonly current = computed(() => this.tabs().find(tab => tab.id === this.active()) ?? this.tabs()[0]);
  protected readonly X = LucideX;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.#copiedTimer));
  }

  protected close(): void {
    this.shell.ui.setPreferencesOpen(false);
  }

  protected onBackdropClick(event: MouseEvent): void {
    closeOnBackdrop(event, () => this.close());
  }

  /** 标题与控件独占一行（控件在标题下方）的设置行。 */
  protected isStacked(row: DrawerRow): boolean {
    return STACKED_KINDS.has(row.control.kind);
  }

  /** 部件与快捷键列表自带每一项的标签，设置行本身不渲染标题。 */
  protected isLabelled(row: DrawerRow): boolean {
    return row.control.kind !== 'widgets' && row.control.kind !== 'shortcuts';
  }

  protected async copy(): Promise<void> {
    await navigator.clipboard?.writeText(this.shell.preferences.exportJson());
    this.copied.set(true);
    this.#copiedTimer = setTimeout(() => this.copied.set(false), COPIED_MS);
  }
}
