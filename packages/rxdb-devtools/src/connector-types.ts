import type { EntityType, RxDB } from '@aiao/rxdb';
import type { DevToolsCapability } from './types.js';

/**
 * DevTools 实际使用的 RxDB 能力子集。
 *
 * @remarks
 * 从 `@aiao/rxdb` 的 `RxDB` 上 `Pick` 而不是本包再抄一份鸭子接口：
 * 抄来的 `addEventListener(type: string, ...)` 和 callback-only 的 repository
 * 契约根本不等于真实泛型 API，于是三端 demo 全部被迫 `as any` 才能调 {@link DevToolsConnector.init}，
 * 而上游签名演进时本包不会有任何编译期信号。
 *
 * `@aiao/rxdb` 是 **peerDependency + type-only import**：类型在编译期擦除，
 * 不进运行时产物，也不给 devtools 的消费者增加安装拓扑负担。
 */
export type DevToolsRxDB = Pick<
  RxDB,
  | 'addEventListener'
  | 'removeEventListener'
  | 'disconnectAll'
  | 'getAdapter'
  | 'version'
  | 'config'
  | 'entityManager'
  | 'versionManager'
>;

/**
 * DevTools 实际读取的实体元数据子集。
 *
 * @remarks
 * 有意比上游 `EntityMetadata` 宽（`ReadonlyMap<string, unknown>` 而非
 * `Map<string, EntityPropertyMetadata>`）：连接器只取 `keys()` 当作加密字段名单，
 * 不碰值。真实 `EntityMetadata` 可赋值给本类型，该方向由
 * `rxdb-contract.spec.ts` 的编译契约守住。
 */
export interface DevToolsEntityMetadata {
  /** 实体名称。 */
  readonly name: string;
  /** 实体所属 namespace；省略时按 `'public'` 处理。 */
  readonly namespace?: string;
  /** 声明为加密列的字段名集合；只读取键。 */
  readonly encryptedPropertyMap?: ReadonlyMap<string, unknown>;
}

/**
 * 实体元数据读取函数。
 *
 * @remarks
 * 上游 `getEntityMetadata`（fail-fast，未装饰即抛）与 `tryGetEntityMetadata`
 * （返回 `undefined`）都满足本签名，由调用方决定要哪种语义。
 */
export type GetEntityMetadataFn = (entity: EntityType) => DevToolsEntityMetadata | undefined;

/** RxDB DevTools 配置选项。 */
export interface DevToolsOptions {
  /**
   * 握手完成前缓存的事件条数上限，超出按 FIFO 丢弃最旧的。
   *
   * @defaultValue 100
   * @throws RangeError 构造时传入非正安全整数
   */
  maxBufferSize?: number;

  /**
   * 是否启用连接器。
   *
   * @defaultValue true
   * @remarks
   * `false` 时 {@link DevToolsConnector.init} 直接返回：不注册 message 监听、
   * 不订阅 RxDB 事件、不挂全局 helper。生产构建里关掉它即可完全消除
   * 「页面消息总线上出现实体数据」这条暴露面。
   */
  enabled?: boolean;

  /**
   * 授予 DevTools 的命令能力档。
   *
   * @defaultValue 'full'
   * @remarks
   * 默认 `'full'` 是为了不破坏已发布的扩展面板（它依赖 SWITCH/CREATE/DELETE_BRANCH）。
   * 生产环境应显式降到 `'readonly'` 或 `'none'` —— 页面消息总线对同源脚本完全开放，
   * 档位决定了伪造命令最多能做到什么。语义见 {@link DevToolsCapability}。
   */
  capabilities?: DevToolsCapability;

  /**
   * 是否允许在 opaque origin（`location.origin === 'null'`）下用 `'*'` 广播消息。
   *
   * @defaultValue false
   * @remarks
   * 连接器一律以 `location.origin` 为 `targetOrigin`。sandbox iframe、`data:`/`blob:`
   * 文档的 origin 是不透明的，`location.origin` 求值为字符串 `'null'`，
   * `postMessage(msg, 'null')` 会静默失败 —— 消息不到、也没有任何报错。
   *
   * 默认策略是**显式失败**：{@link DevToolsConnector.init} 打一次 warning 并保持停用，
   * 而不是偷偷退回 `'*'` 把消息广播给同页所有 frame。确实需要在 sandbox 里调试时，
   * 把本项设为 `true` 显式接受该风险。
   */
  allowOpaqueOrigin?: boolean;
}
