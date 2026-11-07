import { findMenuPath, type MenuNode } from '@aiao/rxdb-admin';
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LucideChevronDown, LucideDynamicIcon } from '@lucide/angular';
import { injectAdminShell, injectAdminStore, injectAdminText, type AdminIcon } from '../context';
import { interceptNavigation } from './intercept-navigation';

type Node = MenuNode<AdminIcon>;

/**
 * 顶部导航的水平菜单：分组悬停展开子项，当前页高亮。
 */
@Component({
  selector: 'rxdb-admin-header-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideDynamicIcon, NgTemplateOutlet],
  host: { style: 'display: contents' },
  templateUrl: './header-menu.component.html'
})
export class AdminHeaderMenuComponent {
  readonly #shell = injectAdminShell();

  protected readonly t = injectAdminText();
  protected readonly url = injectAdminStore(this.#shell.currentUrl);
  protected readonly ChevronDown = LucideChevronDown;
  protected readonly activeId = computed(() => findMenuPath(this.nodes(), this.url()).at(-1)?.id);

  /** 菜单树。 */
  readonly nodes = input.required<readonly Node[]>();

  protected go(event: MouseEvent, node: Node): void {
    interceptNavigation(event, () => this.#shell.navigate(node.route as string));
  }
}
