import { activeGroupIds, findMenuPath, groupIds, groupsToOpen, toggleGroup, type MenuNode } from '@aiao/rxdb-admin';
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, type TemplateRef } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';
import { injectAdminShell, injectAdminStore, type AdminIcon } from '../context';
import { interceptNavigation } from './intercept-navigation';

type Node = MenuNode<AdminIcon>;

/** 菜单项附加内容模板的上下文：`let-node` 即当前菜单节点。 */
export interface MenuExtraContext {
  /** 当前菜单节点。 */
  readonly $implicit: MenuNode<AdminIcon>;
}

/** 菜单项右侧的附加内容模板（徽标、计数）。 */
export type MenuExtraTemplate = TemplateRef<MenuExtraContext>;

function railEntries(nodes: readonly Node[]): Array<Node | null> {
  const entries: Array<Node | null> = [];
  for (const node of nodes) {
    if (!node.children?.length) entries.push(node);
    else {
      if (entries.length > 0) entries.push(null);
      entries.push(...railEntries(node.children));
    }
  }
  return entries;
}

/**
 * 侧栏菜单树：分组可折叠（手风琴由偏好控制），当前页高亮，折叠为图标轨时压平。
 *
 * @remarks
 * 分组展开状态只在组件内保存：初始展开当前页所在分组与 `expanded` 分组；之后地址变化时补开当前页所在分组，
 * 菜单更新时补开新出现的 `expanded` 分组（用户收起过的老分组不会被重新打开）。
 * 菜单项右侧的附加内容通过 `extra` 模板输入提供，模板上下文是菜单节点。
 */
@Component({
  selector: 'rxdb-admin-menu-tree',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideDynamicIcon, NgTemplateOutlet],
  host: { style: 'display: contents' },
  templateUrl: './menu-tree.component.html'
})
export class AdminMenuTreeComponent {
  readonly #shell = injectAdminShell();

  protected readonly url = injectAdminStore(this.#shell.currentUrl);
  protected readonly prefs = injectAdminStore(this.#shell.preferences);
  protected readonly activeId = computed(() => findMenuPath(this.nodes(), this.url()).at(-1)?.id);
  protected readonly rails = computed(() => railEntries(this.nodes()));
  protected readonly open = linkedSignal<{ nodes: readonly Node[]; url: string }, ReadonlySet<string>>({
    source: () => ({ nodes: this.nodes(), url: this.url() }),
    computation: ({ nodes, url }, previous) => {
      if (!previous) return new Set(groupsToOpen(nodes, url));
      const menuChanged = previous.source.nodes !== nodes;
      const fresh = [
        ...(menuChanged ? groupsToOpen(nodes, url, new Set(groupIds(previous.source.nodes))) : []),
        ...(previous.source.url !== url ? activeGroupIds(nodes, url) : [])
      ];
      return new Set([...previous.value, ...fresh]);
    }
  });

  /** 菜单树。 */
  readonly nodes = input.required<readonly Node[]>();

  /** 折叠为图标轨（只渲染叶子的图标）。 */
  readonly rail = input.required<boolean>();

  /** 菜单项右侧附加内容的模板。 */
  readonly extra = input<MenuExtraTemplate>();

  protected go(event: MouseEvent, node: Node): void {
    interceptNavigation(event, () => this.#shell.navigate(node.route as string));
  }

  protected toggle(event: Event, id: string, siblings: readonly Node[]): void {
    event.preventDefault();
    const groups = siblings.filter(node => node.children?.length).map(node => node.id);
    this.open.update(current => toggleGroup(current, id, groups, this.prefs().navigation.accordion));
  }
}
