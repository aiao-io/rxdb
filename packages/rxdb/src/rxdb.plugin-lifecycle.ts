import { deepFreeze, isPromise, type LifecycleScope } from '@aiao/utils';
import type { PluginDependencyScheduler } from './plugin/dependency-scheduler.js';
import type { IRxDBPlugin, Plugin } from './rxdb-plugin.js';
import type { IRepositoryConfig, RxDBConfig } from './rxdb.types.js';
import { LIVE_BEHAVIOUR_CONFIG_KEYS } from './rxdb.types.js';

/**
 * 插件生命周期宿主：在 RxDB 类体内构造，把 `#` 字段以普通属性交给本模块。
 *
 * `connection` 是类持有的可变盒子，本模块对 `scope` / `release` 的赋值会写回类字段。
 */
export interface PluginLifecycleHost {
  readonly rxdbInitialized: boolean;
  readonly shuttingDown: boolean;
  readonly pluginMap: Map<Plugin, IRxDBPlugin>;
  readonly scheduler: PluginDependencyScheduler;
  readonly bootstrappingConnects: number;
  readonly connectedAdapters: Set<string>;
  readonly pluginScopes: Map<IRxDBPlugin, LifecycleScope>;
  readonly connection: { scope?: LifecycleScope; release?: Promise<void> };
  readonly config: RxDBConfig;
  readonly repositoryConfigMap: Map<string, IRepositoryConfig>;
  ensureConnectionScope(): LifecycleScope;
}

/**
 * 登记全部插件后只对齐一趟。
 *
 * 首行守卫与 {@link installOnePlugin} 是同一条判据的两份拷贝：批量入口有意不走单个入口。
 */
export function installPlugin(host: PluginLifecycleHost): void {
  if (!host.rxdbInitialized || host.shuttingDown) return;
  for (const plugin of host.pluginMap.values()) host.scheduler.register(plugin);
  host.scheduler.reconcile();
  reportUnsatisfiedPlugins(host);
}

/**
 * 依赖来源尘埃落定之后，把始终没装上的插件点名一次。
 *
 * 两个条件缺一不可：`bootstrappingConnects === 0` 且已有适配器连上。
 */
export function reportUnsatisfiedPlugins(host: PluginLifecycleHost): void {
  if (host.bootstrappingConnects > 0 || host.connectedAdapters.size === 0) return;
  host.scheduler.reportUnsatisfied();
}

/**
 * 把单个插件交给调度器，并立刻对齐一次当前依赖状态。
 *
 * 守卫与 {@link installPlugin} 故意重复：漏掉任一入口会把停机窗口内的 connect 重装进新纪元。
 */
export function installOnePlugin(host: PluginLifecycleHost, plugin: IRxDBPlugin): void {
  if (!host.rxdbInitialized || host.shuttingDown) return;
  host.scheduler.register(plugin);
  host.scheduler.reconcile();
  reportUnsatisfiedPlugins(host);
}

/**
 * 执行 `plugin.install(scope)`。失败只记日志并重抛，不自行释放作用域。
 */
export async function trackPluginInstall(
  host: PluginLifecycleHost,
  plugin: IRxDBPlugin,
  scope: LifecycleScope
): Promise<void> {
  const pendingRelease = host.connection.release;
  if (pendingRelease !== undefined) await pendingRelease;
  if (host.pluginScopes.get(plugin) !== scope) return;
  try {
    const result = plugin.install(scope);
    if (isPromise(result)) await result;
  } catch (err) {
    console.error(`[RxDB] Plugin '${plugin.name}' install failed:`, err);
    throw err;
  }
}

/** 从连接纪元作用域上派生一个插件激活作用域，并登记。 */
export function createPluginScope(host: PluginLifecycleHost, plugin: IRxDBPlugin): LifecycleScope {
  const scope = host.ensureConnectionScope().child(`plugin:${plugin.name}`);
  host.pluginScopes.set(plugin, scope);
  return scope;
}

/**
 * 释放一次插件激活作用域并注销登记。
 *
 * 按 `(plugin, scope)` 身份守卫；清理错误只记日志。
 */
export async function discardPluginScope(
  host: PluginLifecycleHost,
  plugin: IRxDBPlugin,
  scope: LifecycleScope
): Promise<void> {
  if (host.pluginScopes.get(plugin) === scope) host.pluginScopes.delete(plugin);
  try {
    await scope.dispose();
  } catch (err) {
    console.error(`[RxDB] Plugin '${plugin.name}' scope cleanup failed:`, err);
  }
}

/**
 * 释放并置空连接纪元作用域。
 *
 * 置空是同步的，dispose 是异步的。结算后按身份清掉自己那一份释放 Promise。
 */
export function releaseConnectionScope(host: PluginLifecycleHost): Promise<void> {
  const scope = host.connection.scope;
  host.connection.scope = undefined;
  host.pluginScopes.clear();
  if (scope === undefined) return Promise.resolve();
  const release = scope.dispose().catch((error: unknown) => {
    console.error('[RxDB] Connection scope dispose failed:', error);
  });
  host.connection.release = release;
  void release.then(() => {
    if (host.connection.release === release) host.connection.release = undefined;
  });
  return release;
}

/** 纪元结束时复位调度记录。 */
export function resetPluginScheduling(host: PluginLifecycleHost): void {
  host.scheduler.reset();
}

/** 撤销一次 repository 注册，按配置对象身份守卫。 */
export function unregisterRepository(
  host: PluginLifecycleHost,
  repositoryName: string,
  config: IRepositoryConfig
): void {
  if (host.repositoryConfigMap.get(repositoryName) !== config) return;
  host.repositoryConfigMap.delete(repositoryName);
}

/**
 * 表就绪后等待插件安装。
 *
 * 只等已经开工的那些；补装那一步会不会真的装，由 {@link installPlugin} 判。
 */
export async function awaitPluginInstalls(host: PluginLifecycleHost): Promise<void> {
  installPlugin(host);
  const pending = new Set(host.scheduler.startedInstalls());
  await host.scheduler.settle();
  for (const install of host.scheduler.startedInstalls()) pending.add(install);
  const results = await Promise.allSettled(pending);
  const failure = results.find(result => result.status === 'rejected');
  if (failure !== undefined) throw failure.reason;
}

/**
 * 冻结配置：顶层 `Object.freeze`，声明式子树深冻结，
 * {@link LIVE_BEHAVIOUR_CONFIG_KEYS} 列出的字段整棵跳过。
 */
export function freezeConfig(host: PluginLifecycleHost): void {
  const config = host.config as unknown as Record<string, unknown>;
  for (const key of Object.getOwnPropertyNames(config)) {
    if (LIVE_BEHAVIOUR_CONFIG_KEYS.has(key)) continue;
    const value = config[key];
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) continue;
    deepFreeze(value);
  }
  Object.freeze(host.config);
}

/**
 * 逆插入序串行拆卸所有插件：先释放插件作用域，未迁移的再补一次 `destroy()`。
 *
 * 不短路：任一插件抛错只记日志，后面的插件照拆。
 */
export async function destroyPlugin(host: PluginLifecycleHost): Promise<void> {
  for (const plugin of Array.from(host.pluginMap.values()).reverse()) {
    const scope = host.pluginScopes.get(plugin);
    host.pluginScopes.delete(plugin);
    try {
      await scope?.dispose();
    } catch (err) {
      console.error(`[RxDB] Plugin '${plugin.name}' scope dispose failed:`, err);
    }
    if (plugin.lifecycle === 'scoped') continue;
    try {
      await plugin.destroy?.();
    } catch (err) {
      console.error(`[RxDB] Plugin '${plugin.name}' destroy failed:`, err);
    }
  }
}
