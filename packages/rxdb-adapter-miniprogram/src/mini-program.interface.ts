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

/** wa-sqlite Emscripten 模块中由 adapter 与 VFS 直接使用的字段。 */
export interface WaSqliteEmscriptenModule {
  readonly HEAP32: Int32Array;
  readonly HEAPF64: Float64Array;
  readonly HEAPU8: Uint8Array<ArrayBuffer>;
  readonly HEAPU32: Uint32Array;
  _sqlite3_next_stmt(database: number, statement: number): number;
  UTF8ToString(pointer: number): string;
  stringToUTF8(value: string, pointer: number, maximumBytes: number): void;
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

/** 从包内 `assets/wa-sqlite.cjs` 加载的模块工厂。 */
export type WaSqliteModuleFactory = (
  options: WaSqliteModuleFactoryOptions
) => Promise<WaSqliteEmscriptenModule> | WaSqliteEmscriptenModule;

type AnyEntityType = EntityType & (new (...args: never[]) => IEntity);

/** 小程序 adapter 可替换的仓库构造器。 */
export type WaSqliteMiniProgramRepositoryConstructor<T extends RepositoryBase<AnyEntityType>> = new (
  adapter: RxDBAdapterSqliteBase,
  EntityType: EntityType
) => T;

/** 微信小程序版 wa-sqlite adapter 配置。 */
export interface WaSqliteMiniProgramOptions extends IRxDBAdapterOptions {
  /** 由 `assets/wa-sqlite.cjs` 导出的同步 wa-sqlite 模块工厂。 */
  moduleFactory: WaSqliteModuleFactory;
  /** 微信小程序全局 `wx`。显式注入，避免把平台全局藏进库内部。 */
  wechat: MiniProgramWechatApi;
  /** 微信小程序全局 `WXWebAssembly`。 */
  wasmRuntime: MiniProgramWasmRuntime;
  /** 代码包内 wasm 路径。`WXWebAssembly` 不接受 URL 或 ArrayBuffer。 */
  wasmPath?: string;
  /** 数据库文件目录。默认 `${wx.env.USER_DATA_PATH}/rxdb-wa-sqlite`。 */
  databaseRoot?: string;
  /** SQLite 页缓存，单位 KB。 */
  cacheSizeKb?: number;
  /** 覆盖默认仓库实现。 */
  repositories?: Record<string, WaSqliteMiniProgramRepositoryConstructor<RepositoryBase<AnyEntityType>>>;
}

/** adapter 名称。 */
export const ADAPTER_NAME = 'wa-sqlite-miniprogram' as const;

/** 默认代码包内 wasm 路径。 */
export const DEFAULT_WASM_PATH = 'wa-sqlite/wa-sqlite.wasm';
