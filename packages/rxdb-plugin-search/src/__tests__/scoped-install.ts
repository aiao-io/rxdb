/**
 * 测试侧的插件装载夹具，复刻宿主 `RxDB.#track_plugin_install()` 的作用域约定。
 *
 * 搜索插件的 entity 事件监听登记在 `install(scope)` 收到的作用域上，解绑不再由插件自己
 * 记账（US-014）。测试因此必须像宿主一样递一个作用域进去，并在用例收尾时释放它——
 * `destroy()` 现在只复位状态机，不再摘监听。
 */
import { LifecycleScope } from '@aiao/utils';

import type { RxDBPluginSearch } from '../plugin.js';

/** 一次装载的产物。`installing` 与 `plugin.ready` 是同一个 promise 对象。 */
export interface ScopedInstall {
  /** 本次装载的作用域；释放它等价于宿主断连或回滚失败的安装。 */
  readonly scope: LifecycleScope;
  /** `install()` 返回的安装 promise。 */
  readonly installing: Promise<void>;
}

/** 本文件内已创建、尚未释放的作用域。vitest 按文件隔离模块，无需跨文件清理。 */
const pending: LifecycleScope[] = [];

/**
 * 起一个新作用域并装载插件。
 *
 * @param plugin - 待装载的搜索插件实例
 * @returns 本次装载的作用域与安装 promise
 * @throws 透传 `install()` 的同步 fail-fast（例如非法的 `searchable` 声明）
 */
export const installScoped = (plugin: RxDBPluginSearch): ScopedInstall => {
  const scope = new LifecycleScope('search-spec');
  pending.push(scope);
  return { scope, installing: plugin.install(scope) };
};

/**
 * 逆序释放本用例创建的全部作用域，供 `afterEach` 调用。
 *
 * @remarks
 * `dispose()` 幂等，用例里已经手动释放过的作用域再走一遍不会重复执行清理动作。
 */
export const disposeScopes = async (): Promise<void> => {
  for (const scope of pending.splice(0).reverse()) await scope.dispose();
};
