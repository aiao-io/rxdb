import { InjectionToken } from '@angular/core';
import type { DevToolsErrorPayload } from '@aiao/rxdb-devtools';

/**
 * 目录里的一个条目。
 *
 * @remarks
 * 只描述**一层**：子目录的内容要再 `list` 一次。这里刻意不带 `entries`——面板一次只渲染一层，
 * 让契约携带整棵树等于要求每个宿主都能一次性遍历完整个文件根，而原生文件后端做不到
 * （阶段 D 的目录规模不受同源配额约束）。
 */
export interface DevToolsFileEntry {
  /** 条目名，不含路径。 */
  readonly name: string;
  /** 条目种类。 */
  readonly kind: 'file' | 'directory';
  /** 相对文件根的路径，段间用 `/`。 */
  readonly path: string;
  /** 文件字节数；目录上不出现。 */
  readonly size?: number;
  /** 最后修改时间（epoch 毫秒）；目录上不出现。 */
  readonly lastModified?: number;
}

/**
 * 文件信道的结果。
 *
 * @remarks
 * 错误是**值**，方法永不 reject：调用方拿到的失败一定带一个结构化错误码，
 * 而不是一个需要靠文案二次判别的 `Error`。UI 分支只认这个码。
 */
export type DevToolsFileResult<T> =
  | { readonly outcome: 'ok'; readonly value: T }
  | { readonly outcome: 'failed'; readonly error: DevToolsErrorPayload };

/**
 * 上传的终态。
 *
 * @remarks
 * `'sent'` 的字面意思就是它的全部含义：字节已按协议发完，且期间没有收到针对这次上传的错误。
 * 它**不是**「对端已提交」——冻结的 v2 wire 上 `TRANSFER_COMPLETE` 成功时不产生任何帧，
 * 提交回执是协议缺口（登记在 US-904 阶段 C 保留项）。想断言「确实落盘了」只有一条诚实的路：
 * 重新列一次目录，看文件在不在。
 */
export type DevToolsFileUploadAck = 'sent';

/**
 * 面板与文件后端之间的**平台中立**文件信道。
 *
 * @remarks
 * 契约按语义写（列目录 / 下载 / 删除 / 建目录 / 上传），不按某一代 wire 的消息名写：
 * 面板不认识 `requestId`、`transferId`、`uploadId`，也不认识 tabId 或 `webContents`。
 * 宿主怎么把这五件事落到某条真实通道上（Chrome 的 v2 `files` provider、Electron 的原生
 * 文件后端）是 adapter 的责任。
 *
 * 路径一律以文件根为基准，允许前导 `/`（`'/'` 即根）。
 */
export interface DevToolsFileChannel {
  /**
   * 列出一个目录的直接子项。
   *
   * @param path - 目录路径；`'/'` 表示根。
   * @returns 该层的条目；顺序由实现决定，排序在面板侧做。
   */
  list(path: string): Promise<DevToolsFileResult<readonly DevToolsFileEntry[]>>;

  /**
   * 把一个文件交给宿主的保存路径。
   *
   * @param path - 文件路径。
   * @returns 成功即宿主已接手保存动作。
   */
  download(path: string): Promise<DevToolsFileResult<void>>;

  /**
   * 删除一个文件或目录（目录递归）。
   *
   * @param path - 目标路径。
   */
  remove(path: string): Promise<DevToolsFileResult<void>>;

  /**
   * 新建一个目录。
   *
   * @param path - 新目录的完整路径；父目录不存在时由实现补齐，目标已存在即冲突。
   */
  createDirectory(path: string): Promise<DevToolsFileResult<void>>;

  /**
   * 上传一个文件到指定目录。
   *
   * @param path - 目标目录路径。
   * @param file - 要上传的文件。
   * @returns 成功语义见 {@link DevToolsFileUploadAck}。
   */
  upload(path: string, file: File): Promise<DevToolsFileResult<DevToolsFileUploadAck>>;
}

/** {@link DevToolsFileChannel} 的注入令牌。 */
export const DEVTOOLS_FILE_CHANNEL = new InjectionToken<DevToolsFileChannel>('DEVTOOLS_FILE_CHANNEL');
