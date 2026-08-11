import { inject, Injectable, signal } from '@angular/core';
import { ThemeService } from '@modules/angular';

/** 承载整壳布局状态（侧边栏、悬浮头部、主题）的根级服务。 */
@Injectable({
  providedIn: 'root'
})
export class AppService {
  /** 侧边栏是否展开固定；移动端默认关闭，桌面端默认打开。 */
  $sidebarPinned = signal<boolean>(this.#getInitialSidebarState());

  /** 头部是否处于悬浮态（滚动时由布局切换）。 */
  $headerFloating = signal(false);

  /** 主题服务，供模板直接读取当前主题。 */
  theme = inject(ThemeService);

  /** 反转侧边栏的展开状态。 */
  toggleSidebar() {
    this.$sidebarPinned.update(v => !v);
  }

  /** 在 `auto → dark → light → auto` 之间循环切换主题。 */
  toggleTheme() {
    const theme = this.theme.$currentTheme();
    let nextTheme = 'auto';
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

  #getInitialSidebarState(): boolean {
    // 服务端渲染返回 false
    if (typeof window === 'undefined') return false;
    // 移动端默认关闭，桌面端默认打开
    return window.innerWidth >= 768;
  }
}
