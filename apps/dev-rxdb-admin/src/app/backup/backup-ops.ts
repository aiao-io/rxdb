import { isRxDBBackupError, type RxDBBackupErrorCode } from '@aiao/rxdb';

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
export function backupDownloadName(now: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `工作台备份-${stamp}.rxdb-backup`;
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

const CODE_MESSAGES: Record<RxDBBackupErrorCode, string> = {
  unsupported_combination: '当前存储组合不支持备份 / 恢复（浏览器下仅 IndexedDB 存储支持）',
  incompatible_archive: '归档与当前工作台版本不兼容',
  auth_domain_mismatch: '归档的加密认证域与当前工作台不一致',
  corrupt_archive: '归档文件损坏或不是有效的工作台备份',
  truncated_archive: '归档文件不完整（传输中断）',
  target_not_empty: '恢复目标已有数据，请先在空工作台执行恢复',
  target_busy: '工作台已有数据或正在使用，恢复只支持空工作台',
  restore_in_progress: '已有恢复在进行中，请等待完成',
  restore_incomplete: '上次恢复未完成，请先清理残留再重试',
  cleanup_pending: '存在待清理的恢复残留，请先清理',
  aborted: '操作已取消',
  io_error: '文件读写失败，请检查磁盘与文件权限',
  storage_full: '存储空间不足，无法完成备份',
  lock_timeout: '数据库正忙，请稍后重试',
  invalid_state: '当前状态不支持该操作，请刷新页面重试'
};

/** 把引擎错误翻译成用户可读的失败原因（未知错误兜底为原文，不吞掉信息）。 */
export function backupErrorMessage(error: unknown): string {
  if (isRxDBBackupError(error)) {
    return CODE_MESSAGES[error.code];
  }
  if (error instanceof Error && error.message) {
    return `操作失败：${error.message}`;
  }
  return '操作失败，原因未知';
}
