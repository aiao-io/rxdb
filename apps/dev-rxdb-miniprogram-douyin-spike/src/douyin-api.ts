/**
 * @fileoverview 实验用到的抖音小程序 API 子集。
 *
 * 签名照抄抖音开放平台文档；文档没写的部分（例如同步方法抛出值的形状）正是实验要测的，
 * 这里一律按 `unknown` 处理，不做假设。
 */
// 纯类型 import，esbuild 会擦掉：页面包不能真的拉进 adapter 主入口
import type { MiniProgramWasmRuntime } from '@aiao/rxdb-adapter-miniprogram';
import type {
  MiniProgramFileSystemManager,
  MiniProgramRandomValuesOptions
} from '@aiao/rxdb-adapter-miniprogram/runtime';

/** `FileSystemManager.statSync` 返回的 Stat。 */
export interface DouyinStat {
  readonly size: number;
  isDirectory(): boolean;
  isFile(): boolean;
}

/** `statSync(path, true)` 递归结果里的一项。 */
export interface DouyinStatEntry {
  readonly path: string;
  readonly stat: DouyinStat;
}

/** 抖音同步文件系统：adapter 契约之外，实验还要用递归删目录与列目录。 */
export interface DouyinFileSystemManager extends MiniProgramFileSystemManager {
  rmdirSync(path: string, recursive?: boolean): void;
  /** 结果唯一时是 Stat，多个时是数组（基础库 2.60.0 起支持 `recursive`）。 */
  statSync(path: string, recursive?: boolean): DouyinStat | readonly DouyinStatEntry[];
}

/** `tt.setClipboardData` 参数。 */
export interface DouyinClipboardOptions {
  readonly data: string;
  readonly success?: () => void;
  readonly fail?: (error: unknown) => void;
}

/** 全局 `tt` 里实验用到的部分；可选成员缺失本身就是实验结论。 */
export interface DouyinApi {
  readonly env: { readonly USER_DATA_PATH: string };
  getFileSystemManager(): DouyinFileSystemManager;
  getRandomValues?(options: MiniProgramRandomValuesOptions): unknown;
  getSystemInfoSync?(): object;
  setClipboardData?(options: DouyinClipboardOptions): void;
}

/** 全局 `TTWebAssembly`：`instantiate` 给 adapter 用，`compile` 只用来探测路径写法。 */
export interface DouyinWasmRuntime extends MiniProgramWasmRuntime {
  compile?(path: string): Promise<unknown>;
}
