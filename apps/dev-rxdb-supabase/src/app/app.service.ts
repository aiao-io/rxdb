import { inject, Injectable, signal } from '@angular/core';
import { Theme, ThemeService } from './theme.service';

@Injectable({
  providedIn: 'root'
})
export class AppService {
  /** 宽屏（≥ 768px，与 Tailwind 的 md 同口径）：侧栏是常驻栏；窄屏上它是盖住页面的抽屉 */
  readonly #wideViewport = window.matchMedia('(min-width: 768px)');

  /** 侧栏展开：宽屏默认展开，窄屏默认收起（与 dev-rxdb-angular 同口径） */
  $sidebarPinned = signal<boolean>(this.#wideViewport.matches);
  $headerFloating = signal<boolean>(true);

  theme = inject(ThemeService);

  constructor() {
    // 跨过断点（旋转、缩放窗口）时跟着收起或展开；服务是根级单例，监听随页面一起结束
    this.#wideViewport.addEventListener('change', event => this.$sidebarPinned.set(event.matches));
  }

  toggleSidebar() {
    this.$sidebarPinned.update(v => !v);
  }

  /** 窄屏上侧栏是抽屉：选完菜单就收起，露出页面；宽屏上它是常驻栏，不动 */
  closeOverlaySidebar() {
    if (this.#wideViewport.matches) return;
    this.$sidebarPinned.set(false);
  }

  toggleTheme() {
    const theme = this.theme.$currentTheme();
    let nextTheme: Theme = 'auto';
    switch (theme) {
      case 'auto':
        nextTheme = 'dark';
        break;
      case 'dark':
        nextTheme = 'light';
        break;
      case 'light':
        nextTheme = 'auto';
        break;
    }
    this.theme.setTheme(nextTheme);
  }
}
