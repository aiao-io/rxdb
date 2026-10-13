import { inject, Injectable, signal } from '@angular/core';
import { ThemeService } from '@modules/angular';

@Injectable({
  providedIn: 'root'
})
export class AppService {
  // 移动端默认关闭侧边栏
  $sidebarPinned = signal<boolean>(this.#getInitialSidebarState());
  $headerFloating = signal<boolean>(this.#getInitialSidebarState());

  theme = inject(ThemeService);

  constructor() {
    // 断点跨越（旋转 / 窗口缩放）时同步侧栏状态：移动端自动收起、桌面端自动展开。
    // 不做防抖：change 事件只在跨越 768px 断点时触发一次。
    if (typeof window !== 'undefined') {
      window.matchMedia('(min-width: 768px)').addEventListener('change', event => {
        this.$sidebarPinned.set(event.matches);
      });
    }
  }

  toggleSidebar() {
    this.$sidebarPinned.update(v => !v);
  }

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
