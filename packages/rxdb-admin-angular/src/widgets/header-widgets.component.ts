import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import {
  LucideDynamicIcon,
  LucideLockKeyhole,
  LucideMaximize2,
  LucideMinimize2,
  LucideMonitor,
  LucideMoon,
  LucidePalette,
  LucideRotateCw,
  LucideSearch,
  LucideSettings2,
  LucideSun
} from '@lucide/angular';
import { injectAdminShell, injectAdminStore, injectAdminText } from '../context';
import { AdminLanguageWidgetComponent, AdminTimezoneWidgetComponent } from './menu-widgets.component';

/**
 * 顶栏部件区：按偏好的顺序与显隐渲染搜索、主题、语言、时区、全屏、刷新、锁屏与设置入口。
 */
@Component({
  selector: 'rxdb-admin-header-widgets',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AdminLanguageWidgetComponent, AdminTimezoneWidgetComponent, LucideDynamicIcon],
  host: { style: 'display: contents' },
  templateUrl: './header-widgets.component.html'
})
export class AdminHeaderWidgetsComponent {
  protected readonly shell = injectAdminShell();
  protected readonly t = injectAdminText();
  protected readonly keys = injectAdminStore(this.shell.widgets);
  protected readonly shortcuts = injectAdminStore(this.shell.shortcuts.list);
  protected readonly prefs = injectAdminStore(this.shell.preferences);
  protected readonly isDark = injectAdminStore(this.shell.theme.isDark);
  protected readonly fullscreen = injectAdminStore(this.shell.fullscreen.isFullscreen);
  protected readonly hasDiff = injectAdminStore(this.shell.preferences.hasDiff);
  /** 搜索按钮上显示的键帽；快捷键被关闭时为空。 */
  protected readonly searchKeys = computed(() => {
    const shortcut = this.shortcuts().find(info => info.id === 'palette');
    return shortcut?.enabled ? shortcut.keys : [];
  });
  /** 可访问名称必须包含按钮上可见的全部文字（含键帽），否则语音控制用户喊不出按钮名（WCAG 2.5.3）。 */
  protected readonly searchLabel = computed(() => [this.t('widget.search'), ...this.searchKeys()].join(' '));
  protected readonly themeLabel = computed(
    () => `${this.t('widget.theme')}：${this.shell.theme.label(this.prefs().theme.name)}`
  );
  protected readonly themeIcon = computed(() => {
    const { name } = this.prefs().theme;
    if (name === 'system') return LucideMonitor;
    if (name === 'light') return LucideSun;
    if (name === 'dark') return LucideMoon;
    return this.isDark() ? LucideMoon : LucidePalette;
  });
  protected readonly Search = LucideSearch;
  protected readonly Maximize2 = LucideMaximize2;
  protected readonly Minimize2 = LucideMinimize2;
  protected readonly RotateCw = LucideRotateCw;
  protected readonly LockKeyhole = LucideLockKeyhole;
  protected readonly Settings2 = LucideSettings2;
}
