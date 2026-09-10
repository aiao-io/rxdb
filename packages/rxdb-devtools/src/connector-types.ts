import type { EntityType, RxDB } from '@aiao/rxdb';
import type { DevToolsConnectorTransport } from './connector-transport.js';
import type { DevToolsNativeFilesProviderPorts } from './native/native-files-provider.js';
import type { DevToolsProviderRuntime } from './provider/descriptor.js';
import type { DevToolsProvider } from './provider/types.js';
import type { DevToolsCapability } from './types.js';
import type { DevToolsMutationPolicy } from './v2/authorization.js';

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

/**
 * 页内 provider 装配中需要宿主显式注入的那一部分。
 *
 * @remarks
 * 浏览器能自动探测的那一半（OPFS、页面下载路径、RxDB 实例）原则上不在这里——那由连接器
 * 自己按环境装配。这里放的是浏览器探测不到的：原生文件后端、`settings` 的语义 kind 与
 * 显示用 runtime。各字段互相独立，缺省时连接器按浏览器形态装配。
 *
 * 唯一的例外是 {@link DevToolsProviderOptions.getRootDirectory}：它存在不是为了补充探测
 * 结果，而是为了让宿主**否决**探测结果，见该字段自己的说明。
 */
export interface DevToolsProviderOptions {
  /**
   * 原生文件后端端口；给定时 `files` 走 `native-files` 而不是 OPFS。
   *
   * @remarks
   * 不含 `runtime`：它由下面那个字段统一供给，见 {@link DevToolsProviderOptions.runtime}。
   */
  nativeFiles?: Omit<DevToolsNativeFilesProviderPorts, 'runtime'>;
  /** `settings` 领域 provider；缺省为浏览器 settings（`kind: opfs`）。 */
  settings?: DevToolsProvider;
  /**
   * descriptor 显示用 runtime；缺省 `browser`。
   *
   * @remarks
   * 影响 `database` 与 `files`（OPFS 与原生后端都算）。唯一不受影响的是 `settings`——
   * 它的 runtime 跟着注入的 descriptor 走。
   */
  runtime?: DevToolsProviderRuntime;
  /**
   * 显式覆盖 OPFS 根目录入口；传 `undefined` 即**撤掉** `files` 领域。
   *
   * @remarks
   * 上面说浏览器能自动探测的那一半不在这里，唯独这一条是例外，因为宿主需要的是
   * **反向**表态：连接器默认用 `resolveBrowserOpfsRoot()` 探到什么就宣告什么，而宿主
   * 可能已经知道该领域用不了（例：wa-sqlite 落在 IDB 后端时拿不到 OPFS 文件入口）。
   * 这时必须撤掉入口让该领域整个不宣告——留着它，文件页会照常点亮再逐个操作失败，
   * 正是 descriptor 模型要避免的。
   *
   * 省略本字段 = 沿用连接器的自动探测；显式给 `undefined` = 不宣告 `files`。
   */
  getRootDirectory?: () => Promise<FileSystemDirectoryHandle>;
}

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
   * 页面是否为本次运行打开 v2 数据面的写路径。
   *
   * @defaultValue 'omit'
   * @remarks
   * 与 {@link DevToolsOptions.capabilities} 是两个决策者的开关，不能合成一个：
   * 档位说的是「面板被允许下达多重的命令」，本项说的是「页面愿不愿意被写盘」。
   * 合一之后，为了让面板能列目录而调到 `'full'`，会顺带把删除、上传、建目录一起打开。
   *
   * 默认 `'omit'`：接上 provider 只意味着**可读**，写入必须 owner 显式表态。
   * 被拒时对端收到的是 `provider_unsupported`——与「没有这个领域」同形，
   * 不泄漏页面开了哪些写能力（见 {@link DevToolsMutationPolicy}）。
   */
  mutationPolicy?: DevToolsMutationPolicy;

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

  /**
   * 原生宿主（Electron / Tauri）的 provider 装配端口。
   *
   * @remarks
   * 缺省时连接器按浏览器自动探测（OPFS `files` + browser `settings` + `runtime: browser`）。
   * 桌面宿主必须显式给出：原生文件后端（`nativeFiles`）、`settings` 的语义 kind（`sqlite`），
   * 与显示用 `runtime`。省略任何一项都不做「猜一个」的兜底，而是退回浏览器形态。
   */
  providers?: DevToolsProviderOptions;

  /**
   * 连接器的传输层；缺省为浏览器实现（window 总线 + MessageChannel 私有端口）。
   *
   * @remarks
   * Tauri / 其它无共享 `window` 的宿主必须显式给一个宿主传输（如 `invoke`/`listen`），
   * 否则 connector 仍按浏览器发 `window.postMessage`，面板侧永远收不到。缺省保持浏览器行为，
   * 不破坏既有三框架 demo。
   */
  transport?: DevToolsConnectorTransport;
}
