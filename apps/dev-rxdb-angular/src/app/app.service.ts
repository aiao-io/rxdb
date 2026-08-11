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
