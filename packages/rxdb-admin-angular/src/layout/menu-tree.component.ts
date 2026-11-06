import { activeGroupIds, findMenuPath, toggleGroup, type MenuNode } from '@aiao/rxdb-admin';
import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  untracked,
  type TemplateRef
} from '@angular/core';
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

const expandedIds = (nodes: readonly Node[]): string[] =>
  nodes.flatMap(node => [...(node.expanded ? [node.id] : []), ...expandedIds(node.children ?? [])]);

/** 初始展开：当前页所在的分组，加上菜单声明 `expanded` 的分组。 */
const initialOpen = (nodes: readonly Node[], url: string): Set<string> =>
  new Set([...activeGroupIds(nodes, url), ...expandedIds(nodes)]);

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
 * 分组展开状态只在组件内保存：初始展开当前页所在分组与 `expanded` 分组，之后地址变化时补开当前页所在分组。
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
  protected readonly open = linkedSignal<string, ReadonlySet<string>>({
    source: this.url,
    computation: (url, previous) => {
      const nodes = untracked(this.nodes);
      return previous ? new Set([...previous.value, ...activeGroupIds(nodes, url)]) : initialOpen(nodes, url);
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
