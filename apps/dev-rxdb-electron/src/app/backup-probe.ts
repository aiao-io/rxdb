/**
 * @fileoverview US-217 AC#18 / AC#20：打包产物上的备份 / 恢复探针（e2e 专用）。
 *
 * @remarks
 * 打包 smoke 要在**真实产物**上走一遍「备份 → 退出 → 在新数据位置恢复 → 启动」，而 Playwright 只摸得到
 * renderer 的页面全局。探针就是挂在那里的两个方法：`backup()` 把整份归档以 base64 交回 e2e 进程落盘，
 * `restore(archive)` 把 e2e 读回的归档交给后端的恢复。
 *
 * 只在入口 URL 带 `backup-probe=<mode>` 时挂出——那个参数由主进程读 `DEV_RXDB_BACKUP_PROBE` 追加
 * （`main.utils.ts` 的 `resolveEntryUrl`），正常启动的应用上不存在这个全局。
 *
 * 结果一律是可判别的结构而不是异常：跨过 `page.evaluate` 的异常只剩一句文本，`RxDBBackupError.code` 就丢了。
 *
 * @module backup-probe
 */

import {
  isRxDBBackupError,
  type RxDB,
  type RxDBBackupManifest,
  type RxDBBackupResult,
  type RxDBBackupScope,
  type RxDBRestoreResult
} from '@aiao/rxdb';

/** 探针在页面全局上的键名；e2e 的 `backup-restore.spec.ts` 写同一份字面量。 */
export const BACKUP_PROBE_KEY = '__aiaoRxdbBackupProbe__';

/**
 * 探针模式。
 *
 * @remarks
 * - `backup`：照常连接，连上之后可以备份。
 * - `restore`：连接等到一次成功恢复之后才开始——恢复的目标必须是空的、未连接的库。
 */
export type BackupProbeMode = 'backup' | 'restore';

/** 选中的后端怎样备份与恢复；两个桌面建库模块各给一份。 */
export interface BackupProbeArchiveOps {
  /** 把已连接的库写成一份归档。 */
  backup(rxdb: RxDB, sink: WritableStream<Uint8Array>): Promise<RxDBBackupResult>;
  /** 把归档恢复进尚未连接的库。 */
  restore(rxdb: RxDB, source: ReadableStream<Uint8Array>): Promise<RxDBRestoreResult>;
}

/** 操作失败：`code` 是 `RxDBBackupError.code`，其它错误取错误名。 */
export interface BackupProbeFailure {
  readonly status: 'failed';
  readonly code: string;
  readonly message: string;
}

/** 一次备份的结果。 */
export type BackupProbeBackupOutcome =
  | {
      readonly status: 'ok';
      /** 整份归档，base64。 */
      readonly archive: string;
      readonly byteLength: number;
      readonly scope: RxDBBackupScope;
      readonly manifest: RxDBBackupManifest;
    }
  | BackupProbeFailure;

/** 一次恢复的结果。 */
export type BackupProbeRestoreOutcome =
  | { readonly status: 'ok'; readonly scope: RxDBBackupScope; readonly manifest: RxDBBackupManifest }
  | BackupProbeFailure;

/** 挂在 {@link BACKUP_PROBE_KEY} 上的探针。 */
export interface BackupProbe {
  readonly mode: BackupProbeMode;
  /** 备份当前库；库须已连接。 */
  backup(): Promise<BackupProbeBackupOutcome>;
  /** 把 base64 归档恢复进本次启动的库；只在 `restore` 模式下、且只能成功一次。 */
  restore(archive: string): Promise<BackupProbeRestoreOutcome>;
}

const QUERY_PARAM = 'backup-probe';

/** 喂给恢复的块大小，与桌面 host 的流帧同一量级。 */
const SOURCE_CHUNK_BYTES = 64 * 1024;

/** `String.fromCharCode(...)` 单次展开的上限，避开参数个数限制。 */
const ENCODE_SLICE = 0x8000;

/**
 * 本次运行请求的探针模式。
 *
 * @param runtime - 实际调用时传 `globalThis`
 * @returns 模式；入口 URL 没带参数时为 `undefined`
 * @throws {@link RangeError} 参数取了不认识的值时
 */
export const backupProbeMode = (runtime: unknown): BackupProbeMode | undefined => {
  const search = (runtime as { location?: { search?: string } } | null | undefined)?.location?.search;
  if (typeof search !== 'string') return undefined;
  const mode = new URLSearchParams(search).get(QUERY_PARAM);
  if (mode === null) return undefined;
  if (mode === 'backup' || mode === 'restore') return mode;
  throw new RangeError(`${QUERY_PARAM} 只认 backup / restore，收到：${mode}`);
};

const failure = (error: unknown): BackupProbeFailure => {
  if (isRxDBBackupError(error)) return { status: 'failed', code: error.code, message: error.message };
  if (error instanceof Error) return { status: 'failed', code: error.name, message: error.message };
  return { status: 'failed', code: 'unknown', message: String(error) };
};

const invalidState = (message: string): BackupProbeFailure => ({ status: 'failed', code: 'invalid_state', message });

const toBase64 = (chunks: readonly Uint8Array[]): string => {
  let binary = '';
  for (const chunk of chunks) {
    for (let offset = 0; offset < chunk.length; offset += ENCODE_SLICE) {
      binary += String.fromCharCode(...chunk.subarray(offset, offset + ENCODE_SLICE));
    }
  }
  return btoa(binary);
};

/** 把解码后的归档逐块交出去；不整块入队，恢复侧看到的与读文件时的流形状一致。 */
const chunkedSource = (bytes: Uint8Array): ReadableStream<Uint8Array> => {
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.subarray(offset, offset + SOURCE_CHUNK_BYTES));
      offset += SOURCE_CHUNK_BYTES;
    }
  });
};

const backupOf = (database: RxDB, ops: BackupProbeArchiveOps) => async (): Promise<BackupProbeBackupOutcome> => {
  const chunks: Uint8Array[] = [];
  try {
    const result = await ops.backup(
      database,
      new WritableStream<Uint8Array>({ write: chunk => void chunks.push(chunk.slice()) })
    );
    return {
      status: 'ok',
      archive: toBase64(chunks),
      byteLength: chunks.reduce((total, chunk) => total + chunk.byteLength, 0),
      scope: result.scope,
      manifest: result.manifest
    };
  } catch (error) {
    return failure(error);
  }
};

/**
 * 在 `runtime` 上挂出探针。
 *
 * @param runtime - 实际调用时传 `globalThis`
 * @param mode - {@link backupProbeMode} 读出的模式
 * @param database - 本次启动的库（`restore` 模式下尚未连接）
 * @param ops - 选中后端的备份与恢复
 * @returns 连接闸门：`backup` 模式立即 resolve；`restore` 模式在一次成功恢复后 resolve，恢复失败时带着同一个错误 reject
 */
export const installBackupProbe = (
  runtime: object,
  mode: BackupProbeMode,
  database: RxDB,
  ops: BackupProbeArchiveOps
): Promise<void> => {
  const backup = backupOf(database, ops);
  if (mode === 'backup') {
    const probe: BackupProbe = {
      mode,
      backup,
      restore: async () => invalidState('the database is already connected; start in restore mode to restore')
    };
    Object.assign(runtime, { [BACKUP_PROBE_KEY]: probe });
    return Promise.resolve();
  }

  const { promise: gate, resolve, reject } = Promise.withResolvers<void>();
  let consumed = false;
  const probe: BackupProbe = {
    mode,
    backup,
    restore: async archive => {
      if (consumed) return invalidState('this launch has already attempted a restore');
      consumed = true;
      try {
        const bytes = Uint8Array.from(atob(archive), character => character.charCodeAt(0));
        const result = await ops.restore(database, chunkedSource(bytes));
        resolve();
        return { status: 'ok', scope: result.scope, manifest: result.manifest };
      } catch (error) {
        reject(error);
        return failure(error);
      }
    }
  };
  Object.assign(runtime, { [BACKUP_PROBE_KEY]: probe });
  return gate;
};
