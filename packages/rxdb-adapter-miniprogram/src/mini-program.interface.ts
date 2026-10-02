import type { EntityType, IEntity, IRxDBAdapterOptions, RepositoryBase } from '@aiao/rxdb';
import type { RxDBAdapterSqliteBase } from '@aiao/rxdb-adapter-sqlite-core';

/** 微信小程序同步文件系统的最小契约。 */
export interface MiniProgramFileSystemManager {
  accessSync(path: string): void;
  mkdirSync(path: string, recursive?: boolean): void;
  readFileSync(path: string, encoding: 'base64'): string;
  unlinkSync(path: string): void;
  writeFileSync(path: string, data: ArrayBuffer): void;
}

/** `wx.getRandomValues` 成功结果。 */
export interface MiniProgramRandomValuesResult {
  readonly randomValues: ArrayBuffer;
  readonly errMsg?: string;
}

/** `wx.getRandomValues` 的最小参数契约。 */
export interface MiniProgramRandomValuesOptions {
  readonly length: number;
  readonly success?: (result: MiniProgramRandomValuesResult) => void;
  readonly fail?: (error: { readonly errMsg?: string }) => void;
}

/** adapter 需要的微信运行时能力。 */
export interface MiniProgramWechatApi {
  readonly env: { readonly USER_DATA_PATH: string };
  getFileSystemManager(): MiniProgramFileSystemManager;
  getRandomValues?(options: MiniProgramRandomValuesOptions): unknown;
}

/**
 * 已登记的小程序平台 id。
 *
 * 只有可行性矩阵判定 `supported` 且已实现 host 的平台才会进这张表；
 * 未登记的 id 一律按未知平台拒绝，不回退到微信全局。
 */
export const MINI_PROGRAM_PLATFORM_IDS = Object.freeze(['wechat'] as const);

/** 已登记的小程序平台 id。 */
export type MiniProgramPlatformId = (typeof MINI_PROGRAM_PLATFORM_IDS)[number];

/** host 能力在预检与报错里显示的名称，带平台前缀（如 `wx.getFileSystemManager`）。 */
export interface MiniProgramHostCapabilityNames {
  /** 同步文件系统入口。 */
  readonly fileSystem: string;
  /** 用户数据目录常量。 */
  readonly userDataPath: string;
}

/** 运行时补丁写入、能力预检读取的全局对象。 */
export type MiniProgramRuntimeGlobal = typeof globalThis;

/**
 * 数据库文件在宿主文件系统上的存储布局。
 *
 * - `single`：一个逻辑文件对应一个宿主文件，每次落盘整文件覆盖写。
 * - `chunked`：逻辑文件 `P` 存成 `P.0`、`P.1`…，每块 `chunkBytes` 字节，只重写改过的块，
 *   并在新建主 journal 前占一份 2×`chunkBytes` 的回滚余量，撞配额时让出给回滚。
 *
 * 两种布局的文件互不兼容：声明 `chunked` 而目录里已有单文件数据库时直接拒绝，不做迁移。
 */
export type MiniProgramFileLayout =
  | { readonly kind: 'single' }
  | { readonly kind: 'chunked'; readonly chunkBytes: number };

/**
 * 平台无关的小程序宿主：同步文件、用户数据目录、安全随机源与平台 id。
 *
 * 每个平台一个实现，禁止用「形状像 `wx`」的全局对象冒充别的平台。
 * 微信实现见 `createWechatMiniProgramHost(wx)`。
 */
export interface MiniProgramHost {
  /** 平台 id，必须在 {@link MINI_PROGRAM_PLATFORM_IDS} 中。 */
  readonly platform: MiniProgramPlatformId;
  /** 报错前缀，如 `微信小程序`。 */
  readonly displayName: string;
  /** 文件 VFS 报错里的平台简称，如 `微信`。 */
  readonly shortName: string;
  /** 平台 WASM 运行时全局名，如 `WXWebAssembly`。 */
  readonly wasmRuntimeName: string;
  /** 预检能力名。 */
  readonly capabilityNames: MiniProgramHostCapabilityNames;
  /** 用户数据目录；平台不提供时为 `undefined`，由预检报缺失。 */
  readonly userDataPath: string | undefined;
  /**
   * 真实全局对象；缺省时用环境里的 `globalThis`。
   *
   * @remarks
   * 抖音页面模块的包装函数把 `globalThis` 遮蔽成 `undefined`，`global` 也只是不带内置对象的空壳，
   * 只有非严格函数的 `this` 才是真实全局对象。adapter 是严格模式模块拿不到它，
   * 要由调用方在非严格代码里取到后注入。补丁装在这里，RxDB 与 wa-sqlite 才能经自由变量读到。
   * 不是当前 realm 的全局对象时直接拒绝，不回退到环境。
   */
  readonly runtimeGlobal?: MiniProgramRuntimeGlobal;
  /**
   * 存储布局；缺省为 `{ kind: 'single' }`，微信不设。
   *
   * @remarks
   * 抖音覆盖写已有文件时旧文件在写成功前仍计入配额，整文件落盘让库上限只剩配额的一半左右，
   * 撞配额后热 journal 回滚也没有空间，库永久打不开；`chunked` 只重写改过的块并预留回滚余量。
   */
  readonly fileLayout?: MiniProgramFileLayout;
  /**
   * 未传 `wasmPath` 时使用的代码包内 wasm 路径；缺省为 {@link DEFAULT_WASM_PATH}，微信不设。
   *
   * @remarks
   * 抖音把相对路径按当前页面目录解析，只有以 `/` 开头的代码包根路径能在任意页面加载。
   */
  readonly defaultWasmPath?: string;
  /** 同步文件系统；平台不提供时返回 `undefined`，由预检报缺失。 */
  getFileSystemManager(): MiniProgramFileSystemManager | undefined;
  /**
   * 向平台申请恰好 `length` 字节的密码学安全随机数；做不到必须 reject，不许降级。
   *
   * 每次返回新分配的缓冲区，交出后宿主不再读写它：运行时直接把它当随机池，逐段发出并擦零。
   * 复用仍在使用的缓冲区会被识别为违约并拒绝。
   */
  requestRandomValues(length: number): Promise<Uint8Array>;
}

/**
 * 宿主注入方式：微信便利形状 `wechat`，或平台无关的 `host`，二者恰好其一。
 */
export type MiniProgramHostSelection =
  Pick<WaSqliteMiniProgramOptions, 'wechat' | 'host'> | Pick<WaSqliteMiniProgramHostOptions, 'wechat' | 'host'>;

/** `WXWebAssembly.instantiate` 返回的最小实例结构。 */
export interface MiniProgramWasmInstance {
  readonly exports: WebAssembly.Exports;
}

/** 微信小程序提供的 WASM 运行时。 */
export interface MiniProgramWasmRuntime {
  instantiate(
    path: string,
    imports: WebAssembly.Imports
  ): Promise<MiniProgramWasmInstance | { readonly instance: MiniProgramWasmInstance; readonly module?: unknown }>;
}

/**
 * wa-sqlite Emscripten 模块中由 adapter 与 VFS 直接使用的字段。
 *
 * 只声明所有目标构建都导出的最小集合：`@subframe7536/sqlite-wasm` 的 glue 只把
 * `HEAPU8` / `HEAP32` 挂到模块对象上（两者都会在内存增长时被重新赋值），
 * `HEAPU32` / `HEAPF64` 仅存在于 glue 闭包内部，只能经 `setValue` 访问。
 */
export interface WaSqliteEmscriptenModule {
  readonly HEAP32: Int32Array;
  readonly HEAPU8: Uint8Array<ArrayBuffer>;
  _sqlite3_next_stmt(database: number, statement: number): number;
  UTF8ToString(pointer: number): string;
  stringToUTF8(value: string, pointer: number, maximumBytes: number): void;
  setValue(pointer: number, value: number, type: 'double'): void;
}

/** Emscripten 自定义实例化回调。 */
export type ReceiveWasmInstance = (instance: MiniProgramWasmInstance, module?: unknown) => void;

/** 传给小程序版 wa-sqlite glue 的初始化参数。 */
export interface WaSqliteModuleFactoryOptions {
  instantiateWasm(imports: WebAssembly.Imports, receiveInstance: ReceiveWasmInstance): object;
  locateFile(path: string): string;
  print(message: string): void;
  printErr(message: string): void;
}

/** wa-sqlite Emscripten glue 导出的模块工厂，由 `loadSubframeModuleFactory()` 提供。 */
export type WaSqliteModuleFactory = (
  options: WaSqliteModuleFactoryOptions
) => Promise<WaSqliteEmscriptenModule> | WaSqliteEmscriptenModule;

type AnyEntityType = EntityType & (new (...args: never[]) => IEntity);

/** 小程序 adapter 可替换的仓库构造器。 */
export type WaSqliteMiniProgramRepositoryConstructor<T extends RepositoryBase<AnyEntityType>> = new (
  adapter: RxDBAdapterSqliteBase,
  EntityType: EntityType
) => T;

/** 与宿主注入方式无关的 adapter 配置。 */
export interface WaSqliteMiniProgramBaseOptions extends IRxDBAdapterOptions {
  /** 同步 wa-sqlite 模块工厂，取自 `loadSubframeModuleFactory()`。 */
  moduleFactory: WaSqliteModuleFactory;
  /** 小程序 WASM 运行时，微信为全局 `WXWebAssembly`。 */
  wasmRuntime: MiniProgramWasmRuntime;
  /** 代码包内 wasm 路径。小程序 WASM 运行时不接受 URL 或 ArrayBuffer。 */
  wasmPath?: string;
  /** 数据库文件目录。默认 `${host.userDataPath}/rxdb-wa-sqlite`（微信为 `wx.env.USER_DATA_PATH`）。 */
  databaseRoot?: string;
  /** SQLite 页缓存，单位 KB。 */
  cacheSizeKb?: number;
  /** 覆盖默认仓库实现。 */
  repositories?: Record<string, WaSqliteMiniProgramRepositoryConstructor<RepositoryBase<AnyEntityType>>>;
}

/**
 * 微信小程序版 wa-sqlite adapter 配置（微信便利形状）。
 *
 * 保持为 interface，下游可以继续 `extends` / `implements`。平台无关的注入方式见
 * {@link WaSqliteMiniProgramHostOptions}，adapter 与客户端接收二者的联合
 * {@link WaSqliteMiniProgramAdapterOptions}。
 */
export interface WaSqliteMiniProgramOptions extends WaSqliteMiniProgramBaseOptions {
  /**
   * 微信小程序全局 `wx`，是 `host: createWechatMiniProgramHost(wx)` 的便利形状。
   * 显式注入，避免把平台全局藏进库内部。
   */
  wechat: MiniProgramWechatApi;
  /** 与 `wechat` 互斥。 */
  host?: never;
}

/** 以平台无关的 {@link MiniProgramHost} 注入宿主的 adapter 配置。 */
export interface WaSqliteMiniProgramHostOptions extends WaSqliteMiniProgramBaseOptions {
  /** 平台无关的小程序宿主。 */
  host: MiniProgramHost;
  /** 与 `host` 互斥。 */
  wechat?: never;
}

/** adapter 与客户端接收的配置：`wechat` 与 `host` 二选一。 */
export type WaSqliteMiniProgramAdapterOptions = WaSqliteMiniProgramOptions | WaSqliteMiniProgramHostOptions;

/** adapter 名称。 */
export const ADAPTER_NAME = 'wa-sqlite-miniprogram' as const;

/** 默认代码包内 wasm 路径。 */
export const DEFAULT_WASM_PATH = 'wa-sqlite/wa-sqlite.wasm';
