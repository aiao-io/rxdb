import type { LifecycleScope } from '@aiao/utils';
import { RxDB } from './RxDB.js';

/**
 * RxDB 插件接口
 *
 * @remarks
 * 插件在 `install()` 里拿到一个**本次连接纪元专属**的 {@link LifecycleScope}：
 * 每登记一处宿主改动，就在作用域上 `acquire()` 一条撤销条目；断开连接时宿主按
 * 逆序串行释放它们。插件因此不需要自己维护「装了什么、该拆什么」的清单，
 * 也不需要终态标记——作用域自己有 `active / disposing / disposed` 三态。
 *
 * 作用域**不跨纪元复用**：`disconnectAll()` 之后重新 `connect()`，`install()`
 * 会被传入一个全新的作用域实例。把它存到实例字段上跨纪元读，读到的是已释放的旧对象。
 *
 * @example
 * ```ts
 * class MyPlugin extends RxDBPluginBase implements IRxDBPlugin {
 *   readonly lifecycle = 'scoped' as const;
 *   readonly name = 'my' as const;
 *
 *   install(scope: LifecycleScope) {
 *     const channel = scope.acquire(() => {
 *       const bc = new BroadcastChannel('my');
 *       return () => bc.close();
 *     }, 'my:channel');
 *   }
 * }
 * ```
 */
export interface IRxDBPlugin {
  /**
   * 声明本插件已迁移到作用域拆卸。
   *
   * @remarks
   * 取值为 `'scoped'` 时宿主释放完插件作用域就收手，**不再**调用 {@link IRxDBPlugin.destroy}。
   * 双版本插件（既要能装进旧宿主又要能装进新宿主）两样都写：旧宿主不认识本字段、只会走
   * `destroy()`；新宿主认识，于是只走作用域，两边都不会清理两次。
   *
   * 之所以要显式标记而不是去看 `install.length` 有没有形参：转译产物、`Function.prototype.bind`
   * 与压缩器都会改写形参个数，把它当契约会误判。
   */
  readonly lifecycle?: 'scoped';

  /** 插件名，用于日志与宿主侧的错误归因 */
  name: Uncapitalize<string>;

  /**
   * 安装插件。
   *
   * @param scope - 本次连接纪元的插件激活作用域；一次 `acquire()` 只包一步可能抛错的获取
   *
   * @remarks
   * 抛错（含 `Promise` reject）视为安装失败：宿主会先把**已经登记进 `scope` 的部分**
   * 逆序释放掉，再把原错误传播给 `connect()`。回滚期间的清理错误只记日志，不会盖掉安装错误。
   *
   * 实现方不写形参不破坏契约——`install()` 与 `install(scope)` 同样满足本接口。
   */
  install(scope: LifecycleScope): void | Promise<void>;

  /**
   * 拆卸插件。
   *
   * @deprecated 改用 `install(scope)` 里的 `scope.acquire()` 登记撤销条目，并声明
   * {@link IRxDBPlugin.lifecycle} 为 `'scoped'`。本方法仅为尚未迁移的插件保留：
   * 未声明 `lifecycle` 时，宿主会在释放完插件作用域**之后**再调用它一次。
   *
   * 按仓库废弃周期，本成员至少保留一个次版本（1.0 后为一个主版本周期），移除放在破坏性
   * 版本里进行，并在迁移文档记录。在此之前调用契约不变——已迁移的插件删掉它即可，
   * 双版本插件保留它也不会被清理两次。
   */
  destroy?(): void | Promise<void>;
}

/**
 * RxDB 插件基类
 */
export abstract class RxDBPluginBase {
  constructor(protected readonly rxdb: RxDB) {}
}

/**
 * RxDB 插件
 */
export type Plugin<Options = never> = (rxDB: RxDB, options?: Options) => IRxDBPlugin;
