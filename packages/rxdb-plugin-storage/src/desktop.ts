/**
 * @fileoverview 桌面原生文件后端（US-504）
 *
 * @remarks
 * 把文件内容写进宿主的应用数据目录，而不是 WebView 的 OPFS —— 这样 metadata 所在的
 * 桌面 SQLite 库（US-207）与文件内容同属一个备份域：拷一个目录就完整带走应用数据。
 *
 * 本模块只经 `@aiao/rxdb-plugin-storage/desktop` 子路径导出，**不从主入口再导出**：
 * 主入口要能安全打进浏览器 bundle，而这里依赖桌面 host 的传输层。
 *
 * @module rxdb-plugin-storage/desktop
 */

import {
  DESKTOP_HOST_ADAPTER_NAMES,
  DESKTOP_HOST_MAX_FILE_CHUNK_BYTES,
  DESKTOP_HOST_PROTOCOL_VERSION,
  isDesktopHostAdapterName,
  resolveDesktopHostTransport,
  type DesktopHostFileEntry,
  type DesktopHostFileLockMode,
  type DesktopHostFileReadResult,
  type DesktopHostFileRequest,
  type DesktopHostFileResponse,
  type DesktopHostFileStat,
  type DesktopHostTransport,
  type RxDBAdapterDesktopErrorCode
} from '@aiao/rxdb-adapter-sqlite-core/desktop-host';
import { StorageBackendError, type StorageBackendErrorCode } from './errors.js';
import { decodePhysicalName, encodePhysicalName } from './filesystem/physical-name.js';
import type {
  StorageFilesystem,
  StorageFilesystemContext,
  StorageFilesystemEntry,
  StorageFilesystemFactory,
  StorageFileWriter
} from './filesystem/storage-filesystem.js';
import { normalizeDirectoryPath, normalizeRelativeOpfsPath, normalizeRemovableDirectoryPath } from './paths.js';

/** {@link createDesktopStorageFilesystem} 的可选参数。 */
export interface DesktopStorageFilesystemOptions {
  /**
   * 与 host 通信的传输层；省略时读 preload 注入的全局桥接。
   *
   * @remarks
   * 显式传入只用于测试：生产路径必须走 preload 暴露的那一个对象，
   * 否则 renderer 等于自带了一条不受 `contextBridge` 约束的通道。
   */
  readonly transport?: DesktopHostTransport;
}

/** host 错误码到后端错误码的映射；`file_not_found` 不在表内，另走 NotFound 语义。 */
const BACKEND_ERROR_CODES: Readonly<
  Record<Exclude<RxDBAdapterDesktopErrorCode, 'file_not_found'>, StorageBackendErrorCode>
> = {
  unsupported_runtime_engine: 'backend_unavailable',
  invalid_database_name: 'backend_internal_error',
  host_unavailable: 'backend_unavailable',
  session_closed: 'backend_unavailable',
  protocol_violation: 'backend_internal_error',
  open_failed: 'backend_internal_error',
  permission_denied: 'permission_denied',
  database_corrupted: 'backend_internal_error',
  statement_failed: 'backend_internal_error',
  host_internal_error: 'backend_internal_error',
  database_busy: 'backend_internal_error',
  invalid_file_path: 'path_escape',
  disk_full: 'disk_full',
  write_aborted: 'write_aborted',
  // 两条 PGlite 事务错误码（US-208）：文件族根本发不出会撞上它们的请求，
  // 真收到就说明 host 把应答串到了另一族上——那是 host 内部的错，不是调用方能修的。
  // 表本身是穷尽的（`Record<Exclude<...>>`），漏一条编译期就报，所以这里不能留空。
  transaction_not_found: 'backend_internal_error',
  transaction_unavailable: 'backend_internal_error'
};

/** 单帧上限；读写都按它切分，内容因此不会整块进 JS 堆。 */
const FRAME_BYTES = DESKTOP_HOST_MAX_FILE_CHUNK_BYTES;

type FileResponseOf<K extends DesktopHostFileResponse['kind']> = Extract<DesktopHostFileResponse, { kind: K }>;

/**
 * 构造「目标不存在」错误。
 *
 * @remarks
 * 必须是 `name === 'NotFoundError'`：服务层「不存在即视为空快照」的补偿分支认这个名字，
 * 换成别的错误会让回滚把本不该删的文件删掉。
 */
const notFound = (message: string): DOMException => new DOMException(message, 'NotFoundError');

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null) {
    throw new StorageBackendError('backend_internal_error', `desktop host returned a non-object response`, value);
  }
  return value as Record<string, unknown>;
};

/** 把 host 的错误应答翻成本地错误；不存在走 NotFound，其余带稳定 code。 */
const toBackendError = (record: Record<string, unknown>): Error => {
  const code = record['code'];
  const message = typeof record['message'] === 'string' ? record['message'] : 'desktop host reported a failure';
  if (code === 'file_not_found') {
    return notFound(message);
  }

  const mapped = BACKEND_ERROR_CODES[code as Exclude<RxDBAdapterDesktopErrorCode, 'file_not_found'>];
  if (!mapped) {
    return new StorageBackendError(
      'backend_internal_error',
      `unknown desktop host error code: ${String(code)}`,
      record
    );
  }
  return new StorageBackendError(mapped, message, record);
};

/** 需要携带 `result` 的应答种类；缺 `result` 说明对端不是本协议的实现。 */
const RESULT_BEARING_KINDS: ReadonlySet<string> = new Set([
  'file.open',
  'file.stat',
  'file.list',
  'file.read',
  'file.writeBegin',
  'file.lockAcquire'
]);

/**
 * 校验应答的种类与结构。
 *
 * @throws {@link StorageBackendError} 种类不符或缺 `result` 时抛 `backend_internal_error`；
 *   host 返回错误应答时按 {@link toBackendError} 翻译。
 */
function assertResponseKind<K extends DesktopHostFileResponse['kind']>(
  value: unknown,
  kind: K
): asserts value is FileResponseOf<K> {
  const record = asRecord(value);
  if (record['kind'] === 'error') {
    throw toBackendError(record);
  }
  if (record['kind'] !== kind) {
    throw new StorageBackendError(
      'backend_internal_error',
      `desktop host answered ${String(record['kind'])} to a ${kind} request`,
      record
    );
  }
  if (RESULT_BEARING_KINDS.has(kind) && !('result' in record)) {
    throw new StorageBackendError('backend_internal_error', `desktop host answered ${kind} without a result`, record);
  }
}

/** 逐段编码成物理路径；空段自动丢弃，编码失败按 {@link encodePhysicalName} 的错误码抛出。 */
const toPhysicalPath = (segments: readonly string[]): string =>
  segments
    .flatMap(segment => segment.split('/'))
    .filter(Boolean)
    .map(encodePhysicalName)
    .join('/');

/** 把 `Blob | Uint8Array` 切成不超过单帧上限的分片。 */
const toFrames = async function* (chunk: Blob | Uint8Array<ArrayBuffer>): AsyncGenerator<Uint8Array<ArrayBuffer>> {
  const size = chunk instanceof Blob ? chunk.size : chunk.byteLength;
  for (let offset = 0; offset < size; offset += FRAME_BYTES) {
    const end = Math.min(offset + FRAME_BYTES, size);
    // 一律拷贝：结构化克隆传 TypedArray 视图会连整块底层 ArrayBuffer 一起复制过去。
    yield chunk instanceof Blob ?
      new Uint8Array(await chunk.slice(offset, end).arrayBuffer())
    : chunk.slice(offset, end);
  }
};

/** 发送函数：由文件系统实例绑定会话后交给写入句柄与锁实现。 */
type SendRequest = <K extends DesktopHostFileRequest['kind']>(
  payload: DesktopHostFileRequest & { kind: K }
) => Promise<FileResponseOf<K>>;

/** 把 host 的写入令牌适配成 {@link StorageFileWriter}。 */
class DesktopFileWriter implements StorageFileWriter {
  constructor(
    private readonly send: SendRequest,
    private readonly sessionId: string,
    private readonly writeId: string
  ) {}

  async write(chunk: Blob | Uint8Array<ArrayBuffer>): Promise<void> {
    for await (const frame of toFrames(chunk)) {
      await this.send({ kind: 'file.writeChunk', sessionId: this.sessionId, writeId: this.writeId, chunk: frame });
    }
  }

  async close(): Promise<void> {
    await this.send({ kind: 'file.writeCommit', sessionId: this.sessionId, writeId: this.writeId });
  }

  /**
   * 丢弃本次写入。
   *
   * @remarks
   * 吞掉异常：本方法只在错误处理路径上被调用，再抛一次会盖住真正的失败原因。
   * 令牌可能已经因会话关闭而失效，此时 host 早已删掉临时文件，无事可做。
   */
  async abort(): Promise<void> {
    try {
      await this.send({ kind: 'file.writeAbort', sessionId: this.sessionId, writeId: this.writeId });
    } catch {
      return;
    }
  }
}

/**
 * host 仲裁的跨上下文锁。
 *
 * @remarks
 * 桌面上不能用 Chromium 的 Web Locks：它按 renderer 进程分组，两个窗口各自成组，
 * 临界区于是各自为政。锁必须由唯一的 host 排队。
 */
class DesktopLockBackend implements Pick<LockManager, 'request'> {
  constructor(
    private readonly send: SendRequest,
    private readonly session: () => Promise<string>
  ) {}

  request<T>(name: string, callback: (lock: Lock) => Promise<T>): Promise<T>;
  request<T>(name: string, options: LockOptions, callback: (lock: Lock) => Promise<T>): Promise<T>;
  async request<T>(
    name: string,
    optionsOrCallback: LockOptions | ((lock: Lock) => Promise<T>),
    maybeCallback?: (lock: Lock) => Promise<T>
  ): Promise<T> {
    const options = typeof optionsOrCallback === 'function' ? {} : optionsOrCallback;
    const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
    if (!callback) {
      throw new StorageBackendError('backend_unavailable', 'lock request requires a callback');
    }
    // 静默忽略这些选项会改变调用方看到的语义（`ifAvailable` 会从「立刻返回」变成无限期等待）。
    if (options.ifAvailable || options.steal || options.signal) {
      throw new StorageBackendError(
        'backend_unavailable',
        'desktop lock backend supports only the mode option (ifAvailable / steal / signal are not arbitrated by the host)'
      );
    }

    const mode: DesktopHostFileLockMode = options.mode === 'shared' ? 'shared' : 'exclusive';
    const sessionId = await this.session();
    const acquired = await this.send({ kind: 'file.lockAcquire', sessionId, name, mode });
    const release = (): Promise<unknown> =>
      this.send({ kind: 'file.lockRelease', sessionId, lockId: acquired.result.lockId });

    let value: T;
    try {
      value = await callback({ name, mode });
    } catch (error) {
      // 已经在错误路径上：释放失败再抛一次会盖住临界区里那个真正要修的错误。
      await release().catch(() => undefined);
      throw error;
    }

    // 成功路径上必须抛：释放失败意味着锁还挂在 host 上，后续临界区会永久阻塞。
    await release();
    return value;
  }
}

/** 把文件内容写进宿主应用数据目录的后端。 */
class DesktopStorageFilesystem implements StorageFilesystem {
  /** 已建立的 host 会话；`dispose()` 后置空，下次使用时重开。 */
  #sessionPromise: Promise<string> | null = null;

  readonly lockBackend: Pick<LockManager, 'request'>;

  constructor(
    private readonly rootDir: string,
    private readonly transport: DesktopHostTransport
  ) {
    this.lockBackend = new DesktopLockBackend(this.send, () => this.session());
  }

  async ensureRoot(): Promise<void> {
    await this.mkdir(this.directoryPath('/'));
  }

  async ensureDirectory(directoryPath: string): Promise<void> {
    await this.mkdir(this.directoryPath(directoryPath));
  }

  async directoryExists(directoryPath: string): Promise<boolean> {
    return (await this.stat(this.directoryPath(directoryPath)))?.kind === 'directory';
  }

  async removeDirectory(directoryPath: string): Promise<void> {
    // 校验在发请求之前：host 收到根路径会真的把存储根删掉，此后所有操作都落空。
    const path = this.directoryPath(normalizeRemovableDirectoryPath(directoryPath));
    const sessionId = await this.session();
    await this.send({ kind: 'file.rmdir', sessionId, path });
  }

  async *list(directoryPath: string): AsyncGenerator<StorageFilesystemEntry> {
    const sessionId = await this.session();
    const { result } = await this.send({ kind: 'file.list', sessionId, path: this.directoryPath(directoryPath) });

    for (const entry of assertEntries(result)) {
      yield { name: decodePhysicalName(entry.name), kind: entry.kind };
    }
  }

  async fileExists(filePath: string): Promise<boolean> {
    return (await this.stat(this.filePath(filePath)))?.kind === 'file';
  }

  async readBlob(filePath: string): Promise<Blob> {
    const path = this.filePath(filePath);
    const parts: Uint8Array<ArrayBuffer>[] = [];
    let offset = 0;

    for (;;) {
      const frame = await this.readFrame(path, offset);
      if (frame.chunk.byteLength > 0) parts.push(frame.chunk);
      offset += frame.chunk.byteLength;
      if (frame.eof) return new Blob(parts);
    }
  }

  async openRead(filePath: string): Promise<ReadableStream<Uint8Array>> {
    const path = this.filePath(filePath);
    // 先取首帧再造流：文件不存在必须在这里就抛出，而不是等到调用方开始读。
    let pending = await this.readFrame(path, 0);
    let offset = pending.chunk.byteLength;
    const readFrame = (position: number): Promise<DesktopHostFileReadResult> => this.readFrame(path, position);

    return new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (pending.chunk.byteLength > 0) controller.enqueue(pending.chunk);
        if (pending.eof) {
          controller.close();
          return;
        }

        pending = await readFrame(offset);
        offset += pending.chunk.byteLength;
      }
    });
  }

  async openWrite(filePath: string): Promise<StorageFileWriter> {
    const sessionId = await this.session();
    const { result } = await this.send({ kind: 'file.writeBegin', sessionId, path: this.filePath(filePath) });

    return new DesktopFileWriter(this.send, sessionId, assertWriteId(result));
  }

  async removeFile(filePath: string): Promise<void> {
    const sessionId = await this.session();
    await this.send({ kind: 'file.remove', sessionId, path: this.filePath(filePath) });
  }

  async supportsFileMove(filePath: string): Promise<boolean> {
    await this.assertExists(this.filePath(filePath), 'file');
    return true;
  }

  async moveFile(fromPath: string, toPath: string): Promise<void> {
    await this.move(this.filePath(fromPath), this.filePath(toPath));
  }

  async supportsDirectoryMove(directoryPath: string): Promise<boolean> {
    await this.assertExists(this.directoryPath(directoryPath), 'directory');
    return true;
  }

  async moveDirectory(fromPath: string, toPath: string): Promise<void> {
    await this.move(this.directoryPath(fromPath), this.directoryPath(toPath));
  }

  /**
   * 关闭 host 会话。
   *
   * @remarks
   * 同步返回而关闭是异步的：接口只承诺「释放资源」，而 host 侧未提交的写入与锁
   * 本来就绑定在会话上，进程崩溃时也会被回收，因此这里不需要调用方等待。
   */
  dispose(): void {
    const session = this.#sessionPromise;
    this.#sessionPromise = null;
    if (!session) return;

    void session.then(
      sessionId => this.send({ kind: 'file.close', sessionId }).catch(() => undefined),
      () => undefined
    );
  }

  /** 惰性建立会话；并发的首次调用共享同一个 promise。 */
  private session(): Promise<string> {
    return (this.#sessionPromise ??= this.openSession());
  }

  private async openSession(): Promise<string> {
    const { result } = await this.send({ kind: 'file.open' });
    if (result.protocolVersion !== DESKTOP_HOST_PROTOCOL_VERSION) {
      throw new StorageBackendError(
        'backend_unavailable',
        `desktop host speaks file protocol v${String(result.protocolVersion)}, expected v${DESKTOP_HOST_PROTOCOL_VERSION}`
      );
    }
    return assertSessionId(result);
  }

  /** 绑定 `this` 的发送函数，交给写入句柄与锁实现复用。 */
  private readonly send: SendRequest = async payload => {
    const response = await this.transport.request(payload);
    assertResponseKind(response, payload.kind);
    return response;
  };

  private filePath(filePath: string): string {
    return toPhysicalPath([this.rootDir, normalizeRelativeOpfsPath(filePath)]);
  }

  private directoryPath(directoryPath: string): string {
    return toPhysicalPath([this.rootDir, normalizeDirectoryPath(directoryPath).slice(1)]);
  }

  private async mkdir(path: string): Promise<void> {
    const sessionId = await this.session();
    await this.send({ kind: 'file.mkdir', sessionId, path });
  }

  private async move(fromPath: string, toPath: string): Promise<void> {
    const sessionId = await this.session();
    await this.send({ kind: 'file.move', sessionId, fromPath, toPath });
  }

  private async stat(path: string): Promise<DesktopHostFileStat | null> {
    const sessionId = await this.session();
    const { result } = await this.send({ kind: 'file.stat', sessionId, path });
    return assertStat(result);
  }

  /** 存在性前置检查；不存在或类型不符一律抛 NotFound，调用方据此发现目标已消失。 */
  private async assertExists(path: string, kind: 'directory' | 'file'): Promise<void> {
    if ((await this.stat(path))?.kind !== kind) {
      throw notFound(`desktop storage ${kind} does not exist: ${path}`);
    }
  }

  /**
   * 取一帧内容。
   *
   * @remarks
   * 请求长度恒为正数 {@link FRAME_BYTES}，因此「非 eof 帧必然至少推进一个字节」是协议不变量。
   * 不校验它，坏掉的 host 只要一直回空的非结束帧，{@link DesktopStorageFilesystem.readBlob}
   * 与 {@link DesktopStorageFilesystem.openRead} 的读循环就会原地空转 —— 调用方看到的是永久挂起，
   * 而不是一个能上报的错误。
   */
  private async readFrame(path: string, offset: number): Promise<DesktopHostFileReadResult> {
    const sessionId = await this.session();
    const { result } = await this.send({ kind: 'file.read', sessionId, path, offset, length: FRAME_BYTES });
    const frame = assertReadResult(result);
    if (frame.chunk.byteLength === 0 && !frame.eof) {
      throw new StorageBackendError(
        'backend_internal_error',
        `desktop host returned an empty non-final read frame at offset ${offset}: ${path}`,
        result
      );
    }
    return frame;
  }
}

const invalidResult = (what: string, value: unknown): StorageBackendError =>
  new StorageBackendError('backend_internal_error', `desktop host returned a malformed ${what}`, value);

const assertSessionId = (result: { readonly sessionId: string }): string => {
  if (typeof result.sessionId !== 'string' || result.sessionId === '') throw invalidResult('session id', result);
  return result.sessionId;
};

const assertWriteId = (result: { readonly writeId: string }): string => {
  if (typeof result.writeId !== 'string' || result.writeId === '') throw invalidResult('write id', result);
  return result.writeId;
};

const assertStat = (result: DesktopHostFileStat | null): DesktopHostFileStat | null => {
  if (result === null) return null;
  if (result.kind !== 'directory' && result.kind !== 'file') throw invalidResult('stat', result);
  return result;
};

/**
 * 校验目录列表的形状。
 *
 * @remarks
 * 逐条校验而不是只看外层是不是数组：条目名会直接进 {@link decodePhysicalName}，
 * 缺名的条目会在那里炸成 `TypeError`，调用方拿到的错误既没有稳定 code 也指不出是 host 的问题。
 */
const assertEntries = (result: readonly DesktopHostFileEntry[]): readonly DesktopHostFileEntry[] => {
  if (!Array.isArray(result)) throw invalidResult('directory listing', result);
  for (const entry of result) {
    const isValid =
      typeof entry === 'object' &&
      entry !== null &&
      typeof entry.name === 'string' &&
      entry.name !== '' &&
      (entry.kind === 'directory' || entry.kind === 'file');
    if (!isValid) throw invalidResult('directory entry', entry);
  }
  return result;
};

const assertReadResult = (result: DesktopHostFileReadResult): DesktopHostFileReadResult => {
  if (!(result.chunk instanceof Uint8Array) || typeof result.eof !== 'boolean')
    throw invalidResult('read frame', result);
  return { chunk: result.chunk, eof: result.eof };
};

/**
 * 创建桌面原生文件后端的工厂。
 *
 * @remarks
 * 工厂在被调用时立刻校验本地适配器（AC#9）：metadata 与文件必须落在同一个备份域，
 * 二者错配时**拒绝启用**而不是降级回 OPFS —— 降级会把「两个备份域」这个问题
 * 悄悄留下，而这正是 US-504 要消灭的东西。
 *
 * 判据是**适配器名在册**，而不是某个具体的名字：Electron 与 Tauri 各有各的注册名
 * （`sqlite-electron` / `sqlite-tauri`，见 US-207 E3 的分裂），但备份域这件事上两者同构——
 * 文件与 metadata 都落在宿主的应用数据目录里。登记表在协议层，因此本插件不必为了读两个
 * 字符串常量而依赖两个运行时适配器包。
 *
 * @param options - 可选的传输层覆盖
 * @returns 可直接交给 `RxDBStoragePluginOptions.filesystem` 的工厂
 * @throws {@link StorageBackendError} 本地适配器不是桌面适配器时抛 `adapter_mismatch`
 */
export const createDesktopStorageFilesystem = (
  options: DesktopStorageFilesystemOptions = {}
): StorageFilesystemFactory => {
  return (rootDir: string, context: StorageFilesystemContext): StorageFilesystem => {
    if (!isDesktopHostAdapterName(context.localAdapterName)) {
      throw new StorageBackendError(
        'adapter_mismatch',
        `desktop storage backend requires sync.local.adapter to be one of ${DESKTOP_HOST_ADAPTER_NAMES.join(' / ')}, got '${String(context.localAdapterName)}'`
      );
    }

    return new DesktopStorageFilesystem(rootDir, options.transport ?? resolveDesktopHostTransport());
  };
};
