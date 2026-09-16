import { RxDBPluginAmbiguousDependencyError, RxDBPluginDependencyCycleError } from '../RxDBError.js';
import type { IRxDBPlugin, RxDBPluginDependency } from '../rxdb-plugin.js';

/** `plugin:*` 这一支依赖键，与 {@link RxDBPluginDependency} 的适配器两支互补。 */
export type RxDBPluginNameDependency = `plugin:${Uncapitalize<string>}`;

/**
 * 插件名 → 同名候选全集。
 *
 * @remarks
 * 值是**数组**而不是单个实例（US-015 AC#17）：重名时若只留最后一个，
 * {@link RxDBPluginAmbiguousDependencyError} 就列不出候选，而「悄悄覆盖」正是 D4 要拦的行为。
 */
export type PluginNameIndex = ReadonlyMap<string, readonly IRxDBPlugin[]>;

/** DFS 着色：灰=在当前路径上（回边即环），黑=整棵子图已走完。 */
const GRAY = 1;
const BLACK = 2;

const NO_DEPENDENCIES: readonly RxDBPluginDependency[] = [];
const NO_PROVIDERS: readonly IRxDBPlugin[] = [];

/**
 * 判断依赖键是否指向另一个插件。
 *
 * @param dependency - 依赖键
 * @returns 是 `plugin:*` 返回 `true`；两个 `adapter:*` 返回 `false`
 *
 * @remarks
 * 用穷举而不是 `startsWith('plugin:')`：{@link RxDBPluginDependency} 是封闭联合，
 * 穷举能让将来新增第三类资源键在**编译期**落到这里，而前缀判断只会把它错认成插件名。
 */
export function isPluginNameDependency(dependency: RxDBPluginDependency): dependency is RxDBPluginNameDependency {
  return dependency !== 'adapter:local' && dependency !== 'adapter:remote';
}

/**
 * 把 `plugin:*` 依赖键解析成唯一的提供方实例。
 *
 * @param index - 插件名索引
 * @param dependency - `plugin:*` 依赖键
 * @returns 恰好一个候选时返回该实例；一个都没有返回 `undefined`
 * @throws {@link RxDBPluginAmbiguousDependencyError} 同名候选多于一个（AC#14）
 *
 * @remarks
 * 「没有候选」不是错误（AC#15）：那是依赖缺失，由调度器让插件停在等待态并告警一次，
 * `connect()` 照常 resolve。把它也抛出去会让「装了可选插件才能启动」变成事实上的强依赖。
 */
export function resolveUniqueProvider(
  index: PluginNameIndex,
  dependency: RxDBPluginNameDependency
): IRxDBPlugin | undefined {
  const candidates = index.get(dependency.slice('plugin:'.length));
  if (candidates === undefined || candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];
  throw new RxDBPluginAmbiguousDependencyError(
    dependency,
    candidates.map(candidate => candidate.constructor.name)
  );
}

/**
 * 按「提供方在前」排序全部插件，其余一律回落到插入序。
 *
 * @param plugins - 全部已登记的插件，按 `use()` 顺序
 * @param index - 插件名索引
 * @returns 拓扑序；逆序即拆卸序
 * @throws {@link RxDBPluginDependencyCycleError} 依赖成环（AC#16）
 * @throws {@link RxDBPluginAmbiguousDependencyError} 被依赖的名字有多个候选（AC#14）
 *
 * @remarks
 * 实现是 Kahn，就绪集合按**原始下标**出队，产出的是**字典序最小的拓扑序**。
 * DFS 后序连这个都保不住——它会从第一个依赖方递归下去，把那条链上的提供方整体顶到前面，
 * 越过插入序更早却与之无关的插件。
 *
 * 「互不依赖的插件一律按插入序」是个**不可满足**的愿望，别照字面读 US-015：
 * `[a(依赖 p), b(依赖 q), q, p]` 的拆卸同时要求 `a` 先于 `p`（依赖边）、`b` 先于 `a`
 * 、`p` 先于 `b`（各自的逆插入序），三条连起来成环。既然任何实现都得挑一条打破僵局的
 * 规则，这里挑的是字典序最小：它唯一确定、可被单测钉死，且在所有合法序里离插入序最近。
 * 因此 `[a, b, q, p]` 的结果是 `q → b → p → a` 而不是按层输出的 `q → p → a → b`——
 * 两者都合法，跨层的那个还恰好离插入序更近一点（Kendall-tau 打平，字典序更小）。
 * 能被这条规则重排的只有互相没有依赖边的插件，它们之间真有先后要求就该声明 `inject`。
 *
 * 排序本身不报环：Kahn 只知道「还有节点没出队」。要给出 `a → b → a` 这样的环路径
 * 得另走一趟 DFS，所以环检测留在 {@link cycleError} 里按需触发——正常图不为
 * 一条永不发生的诊断多付一趟遍历。
 *
 * 依赖缺失的插件照常留在序列里：它虽然没装成，拆卸路径仍要走到它（legacy 插件的
 * `destroy()` 配对由调度器的 `everInstalled` 另行把关）。
 */
export function topologicalPluginOrder(plugins: Iterable<IRxDBPlugin>, index: PluginNameIndex): readonly IRxDBPlugin[] {
  const nodes = [...plugins];
  const providers = resolveProviderEdges(nodes, index);
  const order = stablePluginOrder(nodes, providers);
  if (order.length !== nodes.length) throw cycleError(nodes, providers, new Set(order));
  return order;
}

/**
 * 在安装规划阶段校验依赖图。
 *
 * @param plugins - 全部已登记的插件，按 `use()` 顺序
 * @param index - 插件名索引
 * @throws {@link RxDBPluginDependencyCycleError} 依赖成环（AC#16）
 * @throws {@link RxDBPluginAmbiguousDependencyError} 被依赖的名字有多个候选（AC#14）
 *
 * @remarks
 * 调用点在 `reconcile()` **之前**：此刻一个 `install()` 都还没发起，抛出去也不会留下半装状态。
 * 复用 {@link topologicalPluginOrder} 而不另写一套遍历——两处要拒绝的图完全相同，
 * 分成两份实现只会在其中一份漏掉某种形态时才被发现。
 */
export function assertPluginDependencyGraph(plugins: Iterable<IRxDBPlugin>, index: PluginNameIndex): void {
  void topologicalPluginOrder(plugins, index);
}

/**
 * 把每个插件的 `plugin:*` 依赖解析成图上的入边。
 *
 * @param nodes - 全部已登记的插件，按 `use()` 顺序
 * @param index - 插件名索引
 * @returns 插件 → 它的提供方实例列表
 * @throws {@link RxDBPluginAmbiguousDependencyError} 被依赖的名字有多个候选（AC#14）
 *
 * @remarks
 * 只收**登记在册**的提供方：`index` 与 `nodes` 同源，理论上不会解析出外来实例，
 * 但排序的输出必须恰好是输入那批插件，多一个就会让调用方按一份不存在的名单去拆卸。
 * 解析不到的依赖不留边（AC#15 的缺失走等待态，不是排序问题）。
 */
function resolveProviderEdges(
  nodes: readonly IRxDBPlugin[],
  index: PluginNameIndex
): ReadonlyMap<IRxDBPlugin, readonly IRxDBPlugin[]> {
  const registered = new Set(nodes);
  const edges = new Map<IRxDBPlugin, IRxDBPlugin[]>();
  for (const node of nodes) {
    const providers: IRxDBPlugin[] = [];
    for (const dependency of node.inject ?? NO_DEPENDENCIES) {
      if (!isPluginNameDependency(dependency)) continue;
      const provider = resolveUniqueProvider(index, dependency);
      if (provider !== undefined && registered.has(provider)) providers.push(provider);
    }
    edges.set(node, providers);
  }
  return edges;
}

/**
 * Kahn 排序：每轮取「入度归零且原始下标最小」的那个。
 *
 * @param nodes - 全部已登记的插件，按 `use()` 顺序
 * @param providers - {@link resolveProviderEdges} 给出的入边
 * @returns 拓扑序；有环时长度短于 `nodes`（环上的节点入度永不归零）
 *
 * @remarks
 * 出队后**从头重扫**而不是接着往下走：提供方出队可能解锁一个下标更小的依赖方，
 * 接着扫会把它排在下标更大的插件之后，字典序最小这条就又破了。
 * 插件数量是个位到十位数，这点重扫的代价换一条能写进契约的确定性。
 */
function stablePluginOrder(
  nodes: readonly IRxDBPlugin[],
  providers: ReadonlyMap<IRxDBPlugin, readonly IRxDBPlugin[]>
): IRxDBPlugin[] {
  const blocking = new Map<IRxDBPlugin, number>();
  const dependents = new Map<IRxDBPlugin, IRxDBPlugin[]>();
  for (const node of nodes) {
    const incoming = providers.get(node) ?? NO_PROVIDERS;
    blocking.set(node, incoming.length);
    for (const provider of incoming) dependents.set(provider, [...(dependents.get(provider) ?? []), node]);
  }
  const order: IRxDBPlugin[] = [];
  const emitted = new Set<IRxDBPlugin>();
  for (;;) {
    const ready = nodes.find(node => !emitted.has(node) && blocking.get(node) === 0);
    // 没有入度归零的节点了：要么排完了，要么剩下的全被环挡着（由调用方按长度判定）
    if (ready === undefined) break;
    emitted.add(ready);
    order.push(ready);
    for (const dependent of dependents.get(ready) ?? NO_PROVIDERS) {
      blocking.set(dependent, (blocking.get(dependent) ?? 0) - 1);
    }
  }
  return order;
}

/**
 * 在没出队的那批节点上补跑一趟 DFS，把环路径挖出来。
 *
 * @param nodes - 全部已登记的插件，按 `use()` 顺序
 * @param providers - {@link resolveProviderEdges} 给出的入边
 * @param emitted - 已经出队的节点
 * @returns 带完整环路径的错误，交由调用方抛出
 *
 * @remarks
 * 只在 Kahn 短出队时才走：剩下的节点必然全部落在环上或被环挡住，从其中任意一个
 * 出发的 DFS 一定撞到回边。返回而不是就地抛，是为了让 `throw` 留在
 * {@link topologicalPluginOrder} 里——控制流看得见，才不会被当成可选路径。
 */
function cycleError(
  nodes: readonly IRxDBPlugin[],
  providers: ReadonlyMap<IRxDBPlugin, readonly IRxDBPlugin[]>,
  emitted: ReadonlySet<IRxDBPlugin>
): RxDBPluginDependencyCycleError {
  const marks = new Map<IRxDBPlugin, number>();
  const path: IRxDBPlugin[] = [];
  for (const node of nodes) {
    if (emitted.has(node)) continue;
    const found = findCycle(node, providers, marks, path);
    if (found !== undefined) return new RxDBPluginDependencyCycleError(found);
  }
  /* v8 ignore next 2 -- Kahn 短出队等价于有环，这一行只是让返回类型无需可空 */
  return new RxDBPluginDependencyCycleError(nodes.map(node => node.name));
}

/** 三色 DFS：撞到灰点即回边，从路径上截出环。 */
function findCycle(
  plugin: IRxDBPlugin,
  providers: ReadonlyMap<IRxDBPlugin, readonly IRxDBPlugin[]>,
  marks: Map<IRxDBPlugin, number>,
  path: IRxDBPlugin[]
): readonly string[] | undefined {
  const mark = marks.get(plugin);
  if (mark === BLACK) return undefined;
  if (mark === GRAY) return cyclePath(path, plugin);
  marks.set(plugin, GRAY);
  path.push(plugin);
  for (const provider of providers.get(plugin) ?? NO_PROVIDERS) {
    const found = findCycle(provider, providers, marks, path);
    if (found !== undefined) return found;
  }
  path.pop();
  marks.set(plugin, BLACK);
  return undefined;
}

/** 从当前路径截出环：`entry` 起到路径末尾，再回到 `entry`，得到 `a → b → a`。 */
function cyclePath(path: readonly IRxDBPlugin[], entry: IRxDBPlugin): readonly string[] {
  const start = path.indexOf(entry);
  return [...path.slice(start).map(plugin => plugin.name), entry.name];
}
