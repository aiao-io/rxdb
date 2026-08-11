import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import {
  LucideActivity as Activity,
  LucideDatabase as Database,
  LucideFolderOpen as FolderOpen,
  LucideDynamicIcon,
  LucideServer as Server,
  LucideSettings as Settings
} from '@lucide/angular';

@Component({
  selector: 'app-header-nav',
  imports: [RouterLink, RouterLinkActive, LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tabs tabs-boxed tabs-xs" role="tablist">
      @for (item of navItems; track item.path) {
        <a class="tab gap-1" [routerLink]="item.path" role="tab" routerLinkActive="tab-active">
          <svg [lucideIcon]="item.icon" aria-hidden="true" size="12"></svg>
          <span class="hidden sm:inline">{{ item.label }}</span>
        </a>
      }
    </div>
  `
})
export class HeaderNavComponent {
  protected readonly navItems = [
    { path: '/events', label: 'Events', icon: Activity },
    { path: '/database', label: 'Database', icon: Database },
    { path: '/opfs', label: 'OPFS', icon: FolderOpen },
    { path: '/storage', label: 'Storage', icon: Server },
    { path: '/settings', label: 'Settings', icon: Settings }
  ];
}
