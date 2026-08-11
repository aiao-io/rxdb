import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LucideDynamicIcon, LucideMoonStar, LucidePalette, LucideSun } from '@lucide/angular';
import { ThemeService } from '../services/theme.service';

@Component({
  imports: [LucideDynamicIcon],
  selector: 'ao-theme-btn',
  template: ` <button class="btn btn-ghost btn-sm px-2" (click)="toggleTheme()" aria-label="theme">
    @let theme = this.theme.$currentTheme();
    @switch (theme) {
      @case ('light') {
        <svg [lucideIcon]="sunIcon" size="16"></svg>
      }
      @case ('dark') {
        <svg [lucideIcon]="moonStarIcon" size="16"></svg>
      }
      @default {
        <svg [lucideIcon]="paletteIcon" size="16"></svg>
      }
    }
  </button>`,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ThemeBtn {
  protected readonly paletteIcon = LucidePalette;
  protected readonly moonStarIcon = LucideMoonStar;
  protected readonly sunIcon = LucideSun;
  theme = inject(ThemeService);

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
}
