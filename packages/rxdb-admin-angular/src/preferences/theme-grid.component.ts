import type { DrawerRow } from '@aiao/rxdb-admin';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LucideDynamicIcon, LucideMonitor } from '@lucide/angular';
import { injectAdminShell } from '../context';

/**
 * 主题网格：每张卡片在自己的 `data-theme` 作用域里预览该主题的配色。
 */
@Component({
  selector: 'rxdb-admin-theme-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideDynamicIcon],
  host: { style: 'display: contents' },
  template: `
    <div class="admin-theme-grid" [attr.aria-label]="row().label" role="group">
      @for (name of names; track name) {
        <button
          class="admin-theme-card"
          [attr.aria-pressed]="row().value === name"
          [attr.data-testid]="'pref-theme-' + name"
          [attr.data-theme]="name === 'system' ? null : name"
          (click)="row().set(name)"
          type="button"
        >
          <span class="admin-theme-card-body">
            <span class="flex items-center gap-1">
              @if (name === 'system') {
                <svg [lucideIcon]="Monitor" [size]="14"></svg>
              }
              {{ shell.theme.label(name) }}
            </span>
            <span class="admin-theme-swatches" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
          </span>
        </button>
      }
    </div>
  `
})
export class AdminThemeGridComponent {
  protected readonly shell = injectAdminShell();
  protected readonly names = ['system', ...this.shell.theme.options.map(theme => theme.name)];
  protected readonly Monitor = LucideMonitor;

  /** 主题设置行。 */
  readonly row = input.required<DrawerRow>();
}
