import { tabKeyOf } from '../tabs/tabs-ops.js';

/** 导航菜单节点。 */
export interface MenuNode<TIcon = unknown> {
  /** 唯一标识。 */
  readonly id: string;
  /** 显示文本。 */
  readonly label: string;
  /** 图标，类型由三端绑定决定（React 节点、Vue 组件、Angular 图标名等）。 */
  readonly icon?: TIcon;
  /** 路由地址；纯分组节点没有。 */
  readonly route?: string;
  /** 子节点。 */
  readonly children?: readonly MenuNode<TIcon>[];
  /** 分组初始是否展开；当前页所在分组总是展开。 */
  readonly expanded?: boolean;
  /** 测试标识，渲染为 `data-testid`。 */
  readonly testId?: string;
}

/** 面包屑项。 */
export interface BreadcrumbItem<TIcon = unknown> {
  /** 标识。 */
  readonly id: string;
  /** 文本。 */
  readonly label: string;
  /** 图标。 */
  readonly icon?: TIcon;
  /** 地址；无地址或最后一项不可点击。 */
  readonly route?: string;
}

const matches = (route: string, key: string): boolean =>
  key === route || key.startsWith(`${route === '/' ? '' : route}/`);

const routeLength = <T>(path: readonly MenuNode<T>[]): number => tabKeyOf(path[path.length - 1].route as string).length;

const preferMatch = <T>(
  best: MenuNode<T>[] | undefined,
  candidate: MenuNode<T>[] | undefined
): MenuNode<T>[] | undefined => {
  if (!candidate) return best;
  if (!best) return candidate;
  const precision = routeLength(candidate) - routeLength(best);
  return precision > 0 || (precision === 0 && candidate.length >= best.length) ? candidate : best;
};

const walk = <T>(nodes: readonly MenuNode<T>[], url: string, trail: MenuNode<T>[]): MenuNode<T>[] | undefined => {
  let best: MenuNode<T>[] | undefined;
  for (const node of nodes) {
    const here = [...trail, node];
    const deeper = node.children ? walk(node.children, url, here) : undefined;
    const own = node.route && node.route !== '/' && matches(tabKeyOf(node.route), url) ? here : undefined;
    best = preferMatch(best, preferMatch(own, deeper));
  }
  return best;
};

/**
 * 找到地址所在的菜单路径（从根到叶）。最长路由前缀优先，同一路由取更深节点；根路径 `/` 只精确匹配。
 * @param nodes - 菜单树。
 * @param url - 当前地址。
 * @returns 路径；没有匹配返回空数组。
 */
export function findMenuPath<T>(nodes: readonly MenuNode<T>[], url: string): MenuNode<T>[] {
  const key = tabKeyOf(url);
  const exactRoot = key === '/' ? flattenMenu(nodes).find(node => node.route === '/') : undefined;
  if (exactRoot) return [exactRoot];
  return walk(nodes, key, []) ?? [];
}

/**
 * 展开成带路由的节点列表（先序）。
 * @param nodes - 菜单树。
 * @returns 有 `route` 的节点。
 */
export function flattenMenu<T>(nodes: readonly MenuNode<T>[]): MenuNode<T>[] {
  return nodes.flatMap(node => [...(node.route ? [node] : []), ...flattenMenu(node.children ?? [])]);
}

/**
 * 当前地址对应的菜单标题。
 * @param nodes - 菜单树。
 * @param url - 当前地址。
 * @returns 叶子节点标题；没有匹配返回 `undefined`。
 */
export function menuTitleOf<T>(nodes: readonly MenuNode<T>[], url: string): string | undefined {
  return findMenuPath(nodes, url).at(-1)?.label;
}

/**
 * 当前地址所属的一级节点。
 * @param nodes - 菜单树。
 * @param url - 当前地址。
 * @returns 一级节点；没有匹配返回 `undefined`。
 */
export function findActiveRoot<T>(nodes: readonly MenuNode<T>[], url: string): MenuNode<T> | undefined {
  return findMenuPath(nodes, url)[0];
}

/**
 * 节点的落地路由：自身路由，否则第一个后代的路由。
 * @param node - 菜单节点。
 * @returns 路由；整棵子树都没有路由时为 `undefined`。
 */
export function landingRoute<T>(node: MenuNode<T>): string | undefined {
  if (node.route) return node.route;
  for (const child of node.children ?? []) {
    const route = landingRoute(child);
    if (route) return route;
  }
  return undefined;
}

/**
 * 构建面包屑。
 * @param nodes - 菜单树。
 * @param url - 当前地址。
 * @param home - 首页项；传入时作为第一项（对应 `breadcrumb.showHome`）。
 * @returns 面包屑项；没有匹配返回空数组。
 */
export function buildBreadcrumb<T>(
  nodes: readonly MenuNode<T>[],
  url: string,
  home?: BreadcrumbItem<T>
): BreadcrumbItem<T>[] {
  const path = findMenuPath(nodes, url);
  if (path.length === 0) return [];
  const items = path.map<BreadcrumbItem<T>>(node => ({
    id: node.id,
    label: node.label,
    ...(node.icon !== undefined ? { icon: node.icon } : {}),
    ...(node.route ? { route: node.route } : {})
  }));
  return home ? [home, ...items] : items;
}

/**
 * 当前地址所在的分组 id，用于初始展开侧栏。
 * @param nodes - 菜单树。
 * @param url - 当前地址。
 * @returns 路径上除叶子外的节点 id。
 */
export function activeGroupIds<T>(nodes: readonly MenuNode<T>[], url: string): string[] {
  return findMenuPath(nodes, url)
    .slice(0, -1)
    .map(node => node.id);
}

const groupsOf = <T>(nodes: readonly MenuNode<T>[]): MenuNode<T>[] =>
  nodes.flatMap(node => (node.children?.length ? [node, ...groupsOf(node.children)] : []));

/**
 * 菜单里的全部分组（有子项的节点）id，含嵌套分组，先序。
 * @param nodes - 菜单树。
 * @returns 分组 id。
 */
export function groupIds<T>(nodes: readonly MenuNode<T>[]): string[] {
  return groupsOf(nodes).map(node => node.id);
}

/**
 * 菜单（首次出现或变化后）需要新增展开的分组：此前没见过的分组里，声明了 `expanded` 的，或者位于当前地址路径上的。
 * 已见过的分组不重复展开，因此用户收起过的分组不会被菜单更新重新打开；地址变化时展开当前页所在分组仍用 {@link activeGroupIds}。
 *
 * 用法：绑定在首次渲染时传入空的 `known`；之后每次菜单引用变化，把返回值并入展开集合，并把 `known` 更新为 `groupIds(nodes)`。
 * @param nodes - 当前菜单树。
 * @param url - 当前地址。
 * @param known - 此前已见过的分组 id。
 * @returns 需要并入展开集合的分组 id。
 */
export function groupsToOpen<T>(
  nodes: readonly MenuNode<T>[],
  url: string,
  known: ReadonlySet<string> = new Set()
): string[] {
  const active = new Set(activeGroupIds(nodes, url));
  return groupsOf(nodes)
    .filter(node => !known.has(node.id) && (node.expanded || active.has(node.id)))
    .map(node => node.id);
}

/**
 * 切换分组展开状态；手风琴模式下同级只保留一个展开。
 * @param open - 当前展开的分组 id。
 * @param id - 被切换的分组 id。
 * @param siblings - 与被切换分组同级的分组 id（含自身）。
 * @param accordion - 是否手风琴。
 * @returns 新的展开集合。
 */
export function toggleGroup(
  open: ReadonlySet<string>,
  id: string,
  siblings: readonly string[],
  accordion: boolean
): Set<string> {
  const next = new Set(open);
  if (next.delete(id)) return next;
  if (accordion) for (const sibling of siblings) next.delete(sibling);
  next.add(id);
  return next;
}
