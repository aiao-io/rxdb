import { activeGroupIds, findMenuPath, groupIds, groupsToOpen, toggleGroup, type MenuNode } from '@aiao/rxdb-admin';
import { useMemo, useState, type MouseEvent, type ReactElement, type ReactNode } from 'react';
import { useAdminShell, useAdminStore } from '../context.js';

type Node = MenuNode<ReactNode>;

/** 菜单项右侧的附加内容（徽标、计数）。 */
export type RenderMenuExtra = (node: Node) => ReactNode;

/**
 * 普通左键点击由外壳接管为 SPA 导航；带修饰键、中键仍交给浏览器（新标签打开）。
 * @param event - 点击事件。
 * @param go - 导航动作。
 */
export function interceptNavigation(event: MouseEvent, go: () => void): void {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }
  event.preventDefault();
  go();
}

interface TreeProps {
  readonly nodes: readonly Node[];
  readonly activeId: string | undefined;
  readonly open: ReadonlySet<string>;
  readonly onToggle: (id: string, siblings: readonly string[]) => void;
  readonly extra: RenderMenuExtra | undefined;
}

function MenuLink({
  node,
  active,
  extra
}: {
  node: Node;
  active: boolean;
  extra: RenderMenuExtra | undefined;
}): ReactElement {
  const shell = useAdminShell();
  const route = node.route as string;
  return (
    <a
      href={route}
      className={active ? 'menu-active' : undefined}
      aria-current={active ? 'page' : undefined}
      title={node.label}
      data-testid={node.testId ?? 'admin-menu-link'}
      onClick={event => interceptNavigation(event, () => shell.navigate(route))}
    >
      <span className='admin-menu-icon'>{node.icon}</span>
      <span className='admin-menu-label'>{node.label}</span>
      {extra && <span className='admin-menu-extra'>{extra(node)}</span>}
    </a>
  );
}

function MenuItems({ nodes, activeId, open, onToggle, extra }: TreeProps): ReactElement {
  const siblings = nodes.filter(node => node.children?.length).map(node => node.id);
  return (
    <>
      {nodes.map(node =>
        node.children?.length ?
          <li key={node.id}>
            <details open={open.has(node.id)}>
              <summary
                onClick={event => {
                  event.preventDefault();
                  onToggle(node.id, siblings);
                }}
              >
                <span className='admin-menu-icon'>{node.icon}</span>
                <span className='admin-menu-label'>{node.label}</span>
              </summary>
              <ul>
                <MenuItems nodes={node.children} activeId={activeId} open={open} onToggle={onToggle} extra={extra} />
              </ul>
            </details>
          </li>
        : <li key={node.id}>
            <MenuLink node={node} active={node.id === activeId} extra={extra} />
          </li>
      )}
    </>
  );
}

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

function RailItems({ nodes, activeId, extra }: Pick<TreeProps, 'nodes' | 'activeId' | 'extra'>): ReactElement {
  return (
    <>
      {railEntries(nodes).map((entry, index) =>
        entry === null ?
          <li key={`separator-${index}`} aria-hidden='true' className='admin-menu-rail-separator' />
        : <li key={entry.id}>
            <MenuLink node={entry} active={entry.id === activeId} extra={extra} />
          </li>
      )}
    </>
  );
}

/** {@link MenuTree} 的属性。 */
export interface MenuTreeProps {
  /** 菜单树。 */
  readonly nodes: readonly Node[];
  /** 折叠为图标轨（只渲染叶子的图标）。 */
  readonly rail: boolean;
  /** 菜单项右侧附加内容。 */
  readonly extra?: RenderMenuExtra;
}

/**
 * 侧栏菜单树：分组可折叠（手风琴由偏好控制），当前页高亮，折叠为图标轨时压平。
 * @param props - 菜单与形态。
 * @returns 菜单元素。
 */
export function MenuTree({ nodes, rail, extra }: MenuTreeProps): ReactElement {
  const shell = useAdminShell();
  const url = useAdminStore(shell.currentUrl);
  const prefs = useAdminStore(shell.preferences);
  const [open, setOpen] = useState(() => new Set(groupsToOpen(nodes, url)));
  const [known, setKnown] = useState<ReadonlySet<string>>(() => new Set(groupIds(nodes)));
  const [seen, setSeen] = useState({ nodes, url });
  const activeId = useMemo(() => findMenuPath(nodes, url).at(-1)?.id, [nodes, url]);

  // 地址变化展开当前页所在分组；菜单变化展开新出现的分组（声明了 expanded 或位于当前页路径上）。用户收起过的老分组不动
  if (seen.nodes !== nodes || seen.url !== url) {
    const menuChanged = seen.nodes !== nodes;
    const fresh = [
      ...(menuChanged ? groupsToOpen(nodes, url, known) : []),
      ...(seen.url !== url ? activeGroupIds(nodes, url) : [])
    ];
    setSeen({ nodes, url });
    if (menuChanged) setKnown(new Set(groupIds(nodes)));
    if (fresh.length > 0) setOpen(current => new Set([...current, ...fresh]));
  }

  return (
    <ul
      className={rail ? 'menu admin-menu menu-md' : 'menu admin-menu'}
      data-style={prefs.navigation.styleType}
      data-testid='admin-menu'
    >
      {rail ?
        <RailItems nodes={nodes} activeId={activeId} extra={extra} />
      : <MenuItems
          nodes={nodes}
          activeId={activeId}
          open={open}
          extra={extra}
          onToggle={(id, siblings) =>
            setOpen(current => toggleGroup(current, id, siblings, prefs.navigation.accordion))
          }
        />
      }
    </ul>
  );
}
