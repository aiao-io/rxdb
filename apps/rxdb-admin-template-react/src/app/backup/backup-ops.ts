import { isRxDBBackupError } from '@aiao/rxdb';
import type { I18n } from '@aiao/rxdb-i18n';
import { pageZhMessages } from '../i18n/page-messages';

/**
 * 工作台的备份 / 恢复操作（US-527）。
 *
 * @remarks 引擎契约由已 Done 的 US-217 交付：备份走 `adapter.backup(sink)` 产出
 * 一致性归档；恢复必须在 `rxdb.connect()` 之前经 `getAdapter(name)` 拿未连接实例调用，
 * 只写空目标。本模块把「引擎报错」翻译成「用户读得懂的失败结果」，不新增引擎抽象。
 */

/** 备份 / 恢复能力的最小接口（便于单测注入假适配器模拟失败码）。 */
export interface BackupAdapterLike {
  backup(sink: WritableStream<Uint8Array>): Promise<{ sha256: string; bytes: number }>;
  restore(source: ReadableStream<Uint8Array>): Promise<{ sha256: string }>;
}

/** 一次备份的产物：字节块拼成的归档与结果摘要。 */
export interface CollectedBackup {
  blob: Blob;
  sha256: string;
  bytes: number;
}

/** 把适配器的备份流收进内存，拼成可下载的归档文件。 */
export async function collectBackup(adapter: BackupAdapterLike): Promise<CollectedBackup> {
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  const sink = new WritableStream<Uint8Array>({
    write(chunk) {
      // 流契约只声明 Uint8Array<ArrayBufferLike>；Blob 只收 ArrayBuffer 视图。
      // 适配器实际写入的都是 ArrayBuffer 支撑的普通字节块，此处收窄类型。
      chunks.push(chunk as Uint8Array<ArrayBuffer>);
    }
  });
  const result = await adapter.backup(sink);
  return { blob: new Blob(chunks), sha256: result.sha256, bytes: result.bytes };
}

/** 归档下载文件名：`工作台备份-YYYYMMDD-HHmm.rxdb-backup`。 */
export function backupDownloadName(now: Date = new Date(), prefix = pageZhMessages['backup.filePrefix']): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `${prefix}-${stamp}.rxdb-backup`;
}

/** 把 Blob 交给浏览器下载。 */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  // 点击触发的下载对 blob URL 的读取是异步的，立即回收会让部分浏览器中断下载
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 已初始化的工作台需要换全新浏览器环境恢复，刷新不能清空目标存储。 */
export const RESTORE_TARGET_INITIALIZED_MESSAGE = pageZhMessages['backup.error.target_busy'];

/** 把引擎错误翻译成用户可读的失败原因（未知错误兜底为原文，不吞掉信息）。 */
export function backupErrorMessage(error: unknown, t: I18n['t']): string {
  if (isRxDBBackupError(error)) {
    return t(`backup.error.${error.code}`);
  }
  if (error instanceof Error && error.message) {
    return t('backup.error.operationFailed', { message: error.message });
  }
  return t('backup.error.unknown');
}
