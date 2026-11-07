import type { BreadcrumbItem } from '@aiao/rxdb-admin';
import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';
import { injectAdminShell, injectAdminStore, injectAdminText, type AdminIcon } from '../context';
import { interceptNavigation } from './intercept-navigation';

/**
 * 面包屑：当前页在菜单中的路径。偏好关闭、只有一级且要求隐藏、或没有匹配时不渲染。
 */
@Component({
  selector: 'rxdb-admin-breadcrumb',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideDynamicIcon],
  host: { style: 'display: contents' },
  templateUrl: './breadcrumb.component.html'
})
export class AdminBreadcrumbComponent {
  readonly #shell = injectAdminShell();

  protected readonly t = injectAdminText();
  protected readonly items = injectAdminStore(this.#shell.breadcrumb);
  protected readonly prefs = injectAdminStore(this.#shell.preferences);
  protected readonly breadcrumb = computed(() => this.prefs().breadcrumb);
  protected readonly visible = computed(() => {
    const { enable, hideOnlyOne } = this.breadcrumb();
    const count = this.items().length;
    return enable && count > 0 && !(hideOnlyOne && count <= 1);
  });

  protected go(event: MouseEvent, item: BreadcrumbItem<AdminIcon>): void {
    interceptNavigation(event, () => this.#shell.navigate(item.route as string));
  }
}
