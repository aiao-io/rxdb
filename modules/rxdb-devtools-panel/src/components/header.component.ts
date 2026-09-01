import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DevToolsStateService } from '../services/devtools-state.service';
import { BranchSelectorComponent } from './branch-selector.component';
import { HeaderNavComponent } from './header-nav.component';

@Component({
  selector: 'app-header',
  imports: [NgClass, BranchSelectorComponent, HeaderNavComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="border-base-300 flex items-center justify-between border-b px-3 py-2">
      <div class="flex items-center gap-3">
        <span class="hidden text-sm font-bold md:inline">DevTools</span>
        <div class="flex items-center gap-1.5">
          <div class="h-2 w-2 rounded-full" [ngClass]="connected() ? 'bg-success' : 'bg-error'"></div>
          <span class="text-base-content/60 text-xs">{{ connected() ? '已连接' : '未连接' }}</span>
        </div>
        @if (connected()) {
          <app-branch-selector />
        }
      </div>
      <app-header-nav />
    </header>
  `
})
export class HeaderComponent {
  protected readonly connected = inject(DevToolsStateService).connected;
}
