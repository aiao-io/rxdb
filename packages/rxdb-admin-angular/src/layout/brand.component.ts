import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, type TemplateRef } from '@angular/core';
import { injectAdminShell, injectAdminStore } from '../context';
import { interceptNavigation } from './intercept-navigation';

/**
 * 品牌区：Logo 图片、图标与应用名，点击回首页。偏好关闭 Logo 时不渲染。
 * 没有 Logo 图片时显示 `icon` 模板（`AdminLayoutComponent` 把 `[brandIcon]` 插槽转交到这里）。
 */
@Component({
  selector: 'rxdb-admin-brand',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet],
  host: { style: 'display: contents' },
  template: `
    @if (logo().enable) {
      <a class="admin-brand" [attr.aria-label]="shell.brandTitle" [attr.href]="shell.homeUrl" (click)="go($event)">
        @if (logo().source) {
          <img class="admin-brand-logo" [src]="logo().source" alt="" />
        } @else if (icon(); as slot) {
          <ng-container [ngTemplateOutlet]="slot" />
        }
        @if (logo().showText || !logo().source) {
          <span class="admin-brand-text">{{ shell.brandTitle }}</span>
        }
      </a>
    }
  `
})
export class AdminBrandComponent {
  protected readonly shell = injectAdminShell();
  protected readonly prefs = injectAdminStore(this.shell.preferences);
  protected readonly logo = computed(() => this.prefs().logo);

  /** 没有 Logo 图片时显示的图标模板。 */
  readonly icon = input<TemplateRef<unknown>>();

  protected go(event: MouseEvent): void {
    interceptNavigation(event, () => this.shell.navigate(this.shell.homeUrl));
  }
}
