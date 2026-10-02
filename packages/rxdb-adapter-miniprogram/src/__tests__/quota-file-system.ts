/**
 * @fileoverview 按抖音实测语义建模的带配额内存文件系统。
 *
 * 实测（模拟器 + iOS，US-211 实验 v6/v7/v9）：
 * - 用户目录总配额 10 MiB，所有文件共用；
 * - 覆盖写已有文件时，旧文件在写成功之前仍计入配额，所以要求 `已用 + 新大小 ≤ 配额`；
 * - 覆盖写失败时旧文件原样保留（v6）；新建文件写失败时留下一个 0 字节文件（模拟器 v9）；
 * - 错误原文逐字取自实测，`errNo` 21102 / 21103 同时用于「缺失」与「配额」，不能拿来分类。
 */
import type { MiniProgramFileSystemManager } from '../mini-program.interface.js';

/** 抖音用户目录的实测总配额。 */
export const DOUYIN_USER_DIR_QUOTA_BYTES = 10 * 1024 * 1024;

function douyinError(message: string, errNo: number): Error {
  return Object.assign(new Error(message), { name: 'API_ERROR', errNo, errorCode: 0 });
}

/** 带配额的内存文件系统；`operations` 按顺序记下每次成功的写与删，失败留下的空文件不记。 */
export class QuotaFileSystem implements MiniProgramFileSystemManager {
  readonly files = new Map<string, Uint8Array>();
  readonly directories = new Set<string>();
  readonly operations: string[] = [];
  /** 最近一次配额失败抛出的错误。 */
  lastQuotaError: Error | null = null;

  get usedBytes(): number {
    let used = 0;
    for (const data of this.files.values()) used += data.byteLength;
    return used;
  }

  constructor(public quotaBytes: number = DOUYIN_USER_DIR_QUOTA_BYTES) {}

  accessSync(path: string): void {
    if (this.files.has(path) || this.directories.has(path)) return;
    throw douyinError(`accessSync:fail no such file or directory, accessSync ${path}`, 21102);
  }

  mkdirSync(path: string): void {
    if (this.directories.has(path)) {
      throw douyinError(`mkdirSync:fail file already exists, mkdirSync ${path}`, 21102);
    }
    this.directories.add(path);
  }

  readFileSync(path: string): string {
    const data = this.files.get(path);
    if (!data) throw douyinError(`readFileSync:fail no such file or directory, readFileSync ${path}`, 21103);
    return Buffer.from(data).toString('base64');
  }

  unlinkSync(path: string): void {
    if (!this.files.delete(path)) {
      throw douyinError(`unlinkSync:fail no such file or directory, unlinkSync ${path}`, 21102);
    }
    this.operations.push(`unlink ${path}`);
  }

  writeFileSync(path: string, data: ArrayBuffer): void {
    if (this.usedBytes + data.byteLength > this.quotaBytes) {
      this.lastQuotaError = douyinError('writeFileSync:fail user dir saved file size limit exceeded', 21103);
      if (!this.files.has(path)) this.files.set(path, new Uint8Array(0));
      throw this.lastQuotaError;
    }
    this.files.set(path, Uint8Array.from(new Uint8Array(data)));
    this.operations.push(`write ${path} ${data.byteLength}`);
  }
}
