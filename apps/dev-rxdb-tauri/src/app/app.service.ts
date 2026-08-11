import { inject, Injectable, signal } from '@angular/core';
import { ThemeService } from '@modules/angular';

@Injectable({
  providedIn: 'root'
})
/** 外壳布局（侧边栏、头部、主题）的应用级状态。 */
export class AppService {
  /** 侧边栏是否展开；移动端默认关闭，桌面端默认打开。 */
  $sidebarPinned = signal<boolean>(this.#getInitialSidebarState());
  /** 头部是否处于浮动态。 */
  $headerFloating = signal(false);

  /** 主题服务，供 {@link AppService.toggleTheme} 与模板读取当前主题。 */
  theme = inject(ThemeService);

  /** 展开/收起侧边栏。 */
  toggleSidebar() {
    this.$sidebarPinned.update(v => !v);
  }

  /** 在 `auto → dark → light` 之间循环切换主题。 */
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
