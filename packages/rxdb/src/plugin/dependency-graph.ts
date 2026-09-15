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
 * 按「提供方在前」排序全部插件，同层保持插入序。
 *
 * @param plugins - 全部已登记的插件，按 `use()` 顺序
 * @param index - 插件名索引
 * @returns 拓扑序；逆序即拆卸序
 * @throws {@link RxDBPluginDependencyCycleError} 依赖成环（AC#16）
 * @throws {@link RxDBPluginAmbiguousDependencyError} 被依赖的名字有多个候选（AC#14）
 *
 * @remarks
 * 实现是 DFS 后序而非 Kahn：后序天然保留「互不相关的插件维持插入序」这条性质，
 * 而 Kahn 要靠就绪队列的出队规则额外保证。这条性质是 US-014 的**回归底线**——
 * 没有任何 `plugin:*` 声明时，本函数的输出必须逐项等于输入，
 * 逆序之后才仍是 US-014 承诺的逆插入序。
 *
 * 依赖缺失的插件照常留在序列里：它虽然没装成，拆卸路径仍要走到它（legacy 插件的
 * `destroy()` 配对由调度器的 `everInstalled` 另行把关）。
 */
export function topologicalPluginOrder(plugins: Iterable<IRxDBPlugin>, index: PluginNameIndex): readonly IRxDBPlugin[] {
  const marks = new Map<IRxDBPlugin, number>();
  const path: IRxDBPlugin[] = [];
  const order: IRxDBPlugin[] = [];
  for (const plugin of plugins) visit(plugin, index, marks, path, order);
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

/** 三色 DFS 的单节点访问：先递归提供方，再把自己追加到后序。 */
function visit(
  plugin: IRxDBPlugin,
  index: PluginNameIndex,
  marks: Map<IRxDBPlugin, number>,
  path: IRxDBPlugin[],
  order: IRxDBPlugin[]
): void {
  const mark = marks.get(plugin);
  if (mark === BLACK) return;
  if (mark === GRAY) throw new RxDBPluginDependencyCycleError(cyclePath(path, plugin));
  marks.set(plugin, GRAY);
  path.push(plugin);
  for (const dependency of plugin.inject ?? NO_DEPENDENCIES) {
    if (!isPluginNameDependency(dependency)) continue;
    const provider = resolveUniqueProvider(index, dependency);
    if (provider !== undefined) visit(provider, index, marks, path, order);
  }
  path.pop();
  marks.set(plugin, BLACK);
  order.push(plugin);
}

/** 从当前路径截出环：`entry` 起到路径末尾，再回到 `entry`，得到 `a → b → a`。 */
function cyclePath(path: readonly IRxDBPlugin[], entry: IRxDBPlugin): readonly string[] {
  const start = path.indexOf(entry);
  return [...path.slice(start).map(plugin => plugin.name), entry.name];
}
