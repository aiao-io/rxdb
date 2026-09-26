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
export const MINI_PROGRAM_PLATFORM_IDS = ['wechat'] as const;

/** 已登记的小程序平台 id。 */
export type MiniProgramPlatformId = (typeof MINI_PROGRAM_PLATFORM_IDS)[number];

/** host 能力在预检与报错里显示的名称，带平台前缀（如 `wx.getFileSystemManager`）。 */
export interface MiniProgramHostCapabilityNames {
  /** 同步文件系统入口。 */
  readonly fileSystem: string;
  /** 用户数据目录常量。 */
  readonly userDataPath: string;
}

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
  /** 同步文件系统；平台不提供时返回 `undefined`，由预检报缺失。 */
  getFileSystemManager(): MiniProgramFileSystemManager | undefined;
  /** 向平台申请恰好 `length` 字节的密码学安全随机数；做不到必须 reject，不许降级。 */
  requestRandomValues(length: number): Promise<Uint8Array>;
}

/**
 * 宿主注入方式：微信便利形状 `wechat`，或平台无关的 `host`，二者恰好其一。
 */
export type MiniProgramHostSelection =
  | {
      /**
       * 微信小程序全局 `wx`，是 `host: createWechatMiniProgramHost(wx)` 的便利形状。
       * 显式注入，避免把平台全局藏进库内部。
       */
      wechat: MiniProgramWechatApi;
      host?: never;
    }
  | {
      /** 平台无关的小程序宿主。 */
      host: MiniProgramHost;
      wechat?: never;
    };

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
 * 小程序版 wa-sqlite adapter 配置。
 *
 * 宿主二选一：`wechat`（微信便利形状）或 `host`（平台无关注入点）。
 */
export type WaSqliteMiniProgramOptions = WaSqliteMiniProgramBaseOptions & MiniProgramHostSelection;

/** adapter 名称。 */
export const ADAPTER_NAME = 'wa-sqlite-miniprogram' as const;

/** 默认代码包内 wasm 路径。 */
export const DEFAULT_WASM_PATH = 'wa-sqlite/wa-sqlite.wasm';
