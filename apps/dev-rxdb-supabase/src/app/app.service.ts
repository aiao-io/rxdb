import { inject, Injectable, signal } from '@angular/core';
import { Theme, ThemeService } from './theme.service';

@Injectable({
  providedIn: 'root'
})
export class AppService {
  $sidebarPinned = signal<boolean>(true);
  $headerFloating = signal<boolean>(true);

  theme = inject(ThemeService);

  toggleSidebar() {
    this.$sidebarPinned.update(v => !v);
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
