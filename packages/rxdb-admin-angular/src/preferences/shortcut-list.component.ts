import { ChangeDetectionStrategy, Component } from '@angular/core';
import { injectAdminShell, injectAdminStore, injectAdminText } from '../context';

/**
 * 已注册快捷键列表：键帽 + 单独启停（总开关关闭时整体禁用）。
 */
@Component({
  selector: 'rxdb-admin-shortcut-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  templateUrl: './shortcut-list.component.html'
})
export class AdminShortcutListComponent {
  protected readonly shell = injectAdminShell();
  protected readonly t = injectAdminText();
  protected readonly infos = injectAdminStore(this.shell.shortcuts.list);
  protected readonly prefs = injectAdminStore(this.shell.preferences);

  protected onToggle(event: Event, id: string): void {
    this.shell.shortcuts.setEnabled(id, (event.target as HTMLInputElement).checked);
  }
}
