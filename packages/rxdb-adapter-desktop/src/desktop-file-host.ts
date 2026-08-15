/**
 * 桌面文件 host：把 renderer 送来的 `file.*` 请求落到应用数据目录里的原生文件。
 *
 * @remarks
 * 与 {@link createDesktopSqliteHost} 一样运行在**特权侧**，是唯一接触文件系统的地方。
 * 存在的理由见 US-504：文件内容此前写在 WebView 的 OPFS 里，与桌面 SQLite 不在同一个
 * 备份域 —— 拷贝应用数据目录只带走 metadata，恢复后 meta 指向不存在的文件。
 *
 * 三条不变式贯穿本模块：
 * - **原子提交**：写入先落临时文件，`fsync` 后 `rename` 覆盖目标。进程在任何一刻被杀，
 *   目标要么是旧内容要么是新内容，不会是半写。
 * - **会话归属**：未提交的写入与已持有的锁都挂在会话上，窗口销毁即整体回收。
 * - **永不 reject**：失败一律以 `{ kind:'error', code, message }` 返回，见
 *   {@link DesktopFileHost.handle}。
 *
 * @module desktop-file-host
 */

import { randomUUID } from 'node:crypto';
import { open, mkdir, readdir, rename, rm, stat, type FileHandle } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { RxDBAdapterDesktopError, type RxDBAdapterDesktopErrorCode } from './desktop-error.js';
import {
  DESKTOP_HOST_PROTOCOL_VERSION,
  parseDesktopHostFileRequest,
  type DesktopHostFileEntry,
  type DesktopHostFileLockAcquireRequest,
  type DesktopHostFileLockMode,
  type DesktopHostFileLockReleaseRequest,
  type DesktopHostFilePathRequest,
  type DesktopHostFileRequest,
  type DesktopHostFileResponse,
  type DesktopHostFileStat,
  type DesktopHostFileWriteBeginRequest,
  type DesktopHostFileWriteChunkRequest,
  type DesktopHostFileWriteFinishRequest
} from './desktop-host-protocol.js';

/** 写入相关的请求。 */
type FileWriteRequest =
  | DesktopHostFileWriteBeginRequest
  | DesktopHostFileWriteChunkRequest
  | DesktopHostFileWriteFinishRequest;

/** 锁相关的请求。 */
type FileLockRequest = DesktopHostFileLockAcquireRequest | DesktopHostFileLockReleaseRequest;

const isWriteRequest = (request: DesktopHostFileRequest): request is FileWriteRequest =>
  request.kind.startsWith('file.write');

const isLockRequest = (request: DesktopHostFileRequest): request is FileLockRequest =>
  request.kind.startsWith('file.lock');

/** {@link createDesktopFileHost} 的入参。 */
export interface DesktopFileHostOptions {
  /**
   * 解析文件存储根的物理绝对路径。
   *
   * @remarks
   * 由宿主应用提供，因为只有它知道自己的数据目录（Electron 下通常是
   * `app.getPath('userData')` 下的一个子目录）。每次请求都会调用它而不是只调一次：
   * Electron 里 `userData` 在 `app.ready` 之前拿不到，缓存会把「还没准备好」永久固化。
   */
  readonly resolveStorageRoot: () => string;
}

/** 桌面文件 host 实例。 */
export interface DesktopFileHost {
  /**
   * 处理一条来自 renderer 的文件请求。
   *
   * @remarks
   * **永不 reject**：失败以 `kind: 'error'` 的应答返回。Electron 的 `ipcRenderer.invoke`
   * 在 reject 时会把错误压平成字符串，自定义错误码随之丢失。
   *
   * @param request - 未经校验的请求负载
   * @returns 协议应答
   */
  handle(request: unknown): Promise<DesktopHostFileResponse>;
  /** 当前打开的会话数，用于诊断与关停检查。 */
  readonly openSessionCount: number;
  /** 关闭全部会话，通常在应用退出前调用。 */
  closeAll(): void;
}

/** 一次尚未提交的写入。 */
interface PendingWrite {
  readonly targetPath: string;
  readonly temporaryPath: string;
  readonly handle: FileHandle;
}

/** 一把排队中的锁请求。 */
interface LockWaiter {
  readonly lockId: string;
  readonly sessionId: string;
  readonly mode: DesktopHostFileLockMode;
  readonly grant: () => void;
  readonly deny: (error: unknown) => void;
}

/** 一个锁名下的持有者与等待队列。 */
interface LockQueue {
  readonly held: Map<string, DesktopHostFileLockMode>;
  waiting: LockWaiter[];
}

/** 一个会话持有的全部资源。 */
interface FileSession {
  readonly writes: Map<string, PendingWrite>;
  readonly lockNames: Map<string, string>;
}

/**
 * errno → 稳定错误码。
 *
 * @remarks
 * 映射发生在 host 侧而不是 renderer 侧：errno 是平台细节，
 * 让它跨过 IPC 只会把平台差异一路带到调用方的 `switch` 里（AC#6）。
 */
const ERRNO_CODES: Readonly<Record<string, RxDBAdapterDesktopErrorCode>> = {
  ENOENT: 'file_not_found',
  ENOTDIR: 'invalid_file_path',
  EISDIR: 'invalid_file_path',
  ENAMETOOLONG: 'invalid_file_path',
  EEXIST: 'invalid_file_path',
  EACCES: 'permission_denied',
  EPERM: 'permission_denied',
  EROFS: 'permission_denied',
  ENOSPC: 'disk_full',
  EDQUOT: 'disk_full'
};

const readErrno = (error: unknown): string | undefined => {
  if (typeof error !== 'object' || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
};

/**
 * 把一次文件系统失败翻译成协议错误。
 *
 * @remarks
 * 认不出的 errno 归到 `host_internal_error` 而不是猜一个近似码：
 * 猜错会让调用方按错误的语义去补偿，比明确的「host 出了意料之外的问题」更糟。
 */
const toFilesystemError = (error: unknown, path: string): RxDBAdapterDesktopError => {
  if (error instanceof RxDBAdapterDesktopError) return error;
  const errno = readErrno(error);
  const code = errno === undefined ? undefined : ERRNO_CODES[errno];
  return new RxDBAdapterDesktopError(
    code ?? 'host_internal_error',
    `${errno ?? 'filesystem failure'} on ${path}`,
    { cause: error }
  );
};

const toErrorResponse = (error: unknown): DesktopHostFileResponse => {
  if (error instanceof RxDBAdapterDesktopError) {
    return { kind: 'error', code: error.code, message: error.detail };
  }
  return {
    kind: 'error',
    code: 'host_internal_error',
    message: error instanceof Error ? error.message : String(error)
  };
};

/**
 * 判断一次读写是否落在存储根之内。
 *
 * @remarks
 * 协议层已经逐段挡过 `..` / 绝对路径 / 盘符，这里是**最后一道**：
 * 符号链接与大小写不敏感卷都可能让逐段校验通过的路径最终解析到根之外，
 * 只有拼完再比前缀才拦得住。
 */
const resolveWithinRoot = (root: string, relativePath: string): string => {
  const absolute = relativePath === '' ? root : resolve(root, relativePath);
  if (absolute !== root && !absolute.startsWith(root + sep)) {
    throw new RxDBAdapterDesktopError('invalid_file_path', `path escapes the storage root: ${relativePath}`);
  }
  return absolute;
};

const toEntryKind = (isDirectory: boolean): DesktopHostFileEntry['kind'] => (isDirectory ? 'directory' : 'file');

/**
 * 创建一个桌面文件 host。
 *
 * @param options - host 配置
 * @returns host 实例
 */
export function createDesktopFileHost(options: DesktopFileHostOptions): DesktopFileHost {
  const sessions = new Map<string, FileSession>();
  const queues = new Map<string, LockQueue>();

  const requireSession = (sessionId: string): FileSession => {
    const session = sessions.get(sessionId);
    if (!session) {
      throw new RxDBAdapterDesktopError('session_closed', `file session ${sessionId} is not open on this host`);
    }
    return session;
  };

  const requireWrite = (session: FileSession, writeId: string): PendingWrite => {
    const pending = session.writes.get(writeId);
    if (!pending) {
      throw new RxDBAdapterDesktopError('write_aborted', `write ${writeId} is no longer pending`);
    }
    return pending;
  };

  const rootPath = (): string => {
    try {
      return resolve(options.resolveStorageRoot());
    } catch (error) {
      throw new RxDBAdapterDesktopError('host_internal_error', 'the application could not resolve the storage root', {
        cause: error
      });
    }
  };

  const absolutePath = (relativePath: string): string => resolveWithinRoot(rootPath(), relativePath);

  // ---- 锁仲裁 -------------------------------------------------------------

  const queueOf = (name: string): LockQueue => {
    const existing = queues.get(name);
    if (existing) return existing;
    const created: LockQueue = { held: new Map(), waiting: [] };
    queues.set(name, created);
    return created;
  };

  const canGrant = (queue: LockQueue, waiter: LockWaiter): boolean => {
    if (queue.held.size === 0) return true;
    if (waiter.mode === 'exclusive') return false;
    return [...queue.held.values()].every(mode => mode === 'shared');
  };

  /** 按 FIFO 推进队列；队首拿不到就整队停住，避免独占请求被共享流饿死。 */
  const pump = (name: string): void => {
    const queue = queueOf(name);
    while (queue.waiting.length > 0 && canGrant(queue, queue.waiting[0])) {
      const waiter = queue.waiting.shift() as LockWaiter;
      queue.held.set(waiter.lockId, waiter.mode);
      waiter.grant();
    }
  };

  const acquireLock = (sessionId: string, name: string, mode: DesktopHostFileLockMode): Promise<string> => {
    const session = requireSession(sessionId);
    const lockId = randomUUID();
    return new Promise<string>((grantResolve, grantReject) => {
      queueOf(name).waiting.push({
        lockId,
        sessionId,
        mode,
        grant: () => {
          session.lockNames.set(lockId, name);
          grantResolve(lockId);
        },
        deny: grantReject
      });
      pump(name);
    });
  };

  const releaseLock = (session: FileSession, lockId: string): void => {
    const name = session.lockNames.get(lockId);
    if (name === undefined) {
      throw new RxDBAdapterDesktopError('protocol_violation', `lock ${lockId} is not held by this session`);
    }
    session.lockNames.delete(lockId);
    queueOf(name).held.delete(lockId);
    pump(name);
  };

  /** 会话消失时，它排队中的请求必须被显式拒绝，否则调用方的 await 永远悬着。 */
  const dropWaiters = (sessionId: string): void => {
    for (const [name, queue] of queues) {
      const denied = queue.waiting.filter(waiter => waiter.sessionId === sessionId);
      queue.waiting = queue.waiting.filter(waiter => waiter.sessionId !== sessionId);
      for (const waiter of denied) {
        waiter.deny(new RxDBAdapterDesktopError('session_closed', `file session ${sessionId} closed while queued`));
      }
      pump(name);
    }
  };

  // ---- 会话生命周期 -------------------------------------------------------

  /**
   * 丢弃一次写入。
   *
   * @remarks
   * 关闭句柄与删除临时文件的失败都吞掉：本函数只在放弃路径与会话回收路径上跑，
   * 再抛一次会盖住真正的失败原因，而残留的临时文件在下次启动时无害。
   */
  const discardWrite = async (pending: PendingWrite): Promise<void> => {
    await pending.handle.close().catch(() => undefined);
    await rm(pending.temporaryPath, { force: true }).catch(() => undefined);
  };

  const closeSession = async (sessionId: string): Promise<void> => {
    const session = sessions.get(sessionId);
    if (!session) return;
    sessions.delete(sessionId);

    for (const lockId of [...session.lockNames.keys()]) {
      const name = session.lockNames.get(lockId) as string;
      session.lockNames.delete(lockId);
      queueOf(name).held.delete(lockId);
      pump(name);
    }
    dropWaiters(sessionId);

    await Promise.all([...session.writes.values()].map(discardWrite));
    session.writes.clear();
  };

  // ---- 文件操作 -----------------------------------------------------------

  const statPath = async (relativePath: string): Promise<DesktopHostFileStat | null> => {
    const target = absolutePath(relativePath);
    try {
      const stats = await stat(target);
      return {
        kind: toEntryKind(stats.isDirectory()),
        size: stats.isDirectory() ? 0 : stats.size,
        lastModified: stats.mtimeMs
      };
    } catch (error) {
      if (readErrno(error) === 'ENOENT') return null;
      throw toFilesystemError(error, relativePath);
    }
  };

  const listPath = async (relativePath: string): Promise<readonly DesktopHostFileEntry[]> => {
    const target = absolutePath(relativePath);
    try {
      const entries = await readdir(target, { withFileTypes: true });
      return entries.map(entry => ({ name: entry.name, kind: toEntryKind(entry.isDirectory()) }));
    } catch (error) {
      throw toFilesystemError(error, relativePath);
    }
  };

  const runPathOperation = async (operation: () => Promise<unknown>, relativePath: string): Promise<void> => {
    try {
      await operation();
    } catch (error) {
      throw toFilesystemError(error, relativePath);
    }
  };

  const movePath = async (fromPath: string, toPath: string): Promise<void> => {
    const source = absolutePath(fromPath);
    const target = absolutePath(toPath);
    await runPathOperation(() => mkdir(dirname(target), { recursive: true }), toPath);
    await runPathOperation(() => rename(source, target), fromPath);
  };

  const readFrame = async (
    relativePath: string,
    offset: number,
    length: number
  ): Promise<{ chunk: Uint8Array; eof: boolean }> => {
    const target = absolutePath(relativePath);
    let handle: FileHandle | undefined;
    try {
      handle = await open(target, 'r');
      const size = (await handle.stat()).size;
      const buffer = new Uint8Array(Math.max(0, Math.min(length, size - offset)));
      if (buffer.byteLength > 0) await handle.read(buffer, 0, buffer.byteLength, offset);
      return { chunk: buffer, eof: offset + buffer.byteLength >= size };
    } catch (error) {
      throw toFilesystemError(error, relativePath);
    } finally {
      await handle?.close().catch(() => undefined);
    }
  };

  const beginWrite = async (session: FileSession, relativePath: string): Promise<string> => {
    const target = absolutePath(relativePath);
    const writeId = randomUUID();
    const temporaryPath = join(dirname(target), `.${writeId}.rxdb-tmp`);
    await runPathOperation(() => mkdir(dirname(target), { recursive: true }), relativePath);
    try {
      // 'wx' 而不是 'w'：临时名带 UUID，撞名只可能是同名文件已被别处占用，静默覆盖会丢它的内容。
      session.writes.set(writeId, { targetPath: target, temporaryPath, handle: await open(temporaryPath, 'wx') });
      return writeId;
    } catch (error) {
      throw toFilesystemError(error, relativePath);
    }
  };

  /**
   * 提交一次写入。
   *
   * @remarks
   * `sync()` 必须在 `rename()` 之前：rename 本身是原子的，但它只保证目录项的替换原子，
   * 不保证文件内容已经落盘。少了这一步，掉电后目标可能指向一个内容为空洞的新 inode。
   */
  const commitWrite = async (session: FileSession, writeId: string): Promise<void> => {
    const pending = requireWrite(session, writeId);
    session.writes.delete(writeId);
    try {
      await pending.handle.sync();
      await pending.handle.close();
      await rename(pending.temporaryPath, pending.targetPath);
    } catch (error) {
      await rm(pending.temporaryPath, { force: true }).catch(() => undefined);
      throw toFilesystemError(error, pending.targetPath);
    }
  };

  // ---- 派发 ---------------------------------------------------------------

  const dispatchWrite = async (request: FileWriteRequest): Promise<DesktopHostFileResponse> => {
    const session = requireSession(request.sessionId);
    if (request.kind === 'file.writeBegin') {
      return { kind: 'file.writeBegin', result: { writeId: await beginWrite(session, request.path) } };
    }
    if (request.kind === 'file.writeChunk') {
      const pending = requireWrite(session, request.writeId);
      try {
        await pending.handle.write(request.chunk);
      } catch (error) {
        throw toFilesystemError(error, pending.targetPath);
      }
      return { kind: 'file.writeChunk' };
    }
    if (request.kind === 'file.writeCommit') {
      await commitWrite(session, request.writeId);
      return { kind: 'file.writeCommit' };
    }
    const pending = requireWrite(session, request.writeId);
    session.writes.delete(request.writeId);
    await discardWrite(pending);
    return { kind: 'file.writeAbort' };
  };

  const dispatchLock = async (request: FileLockRequest): Promise<DesktopHostFileResponse> => {
    if (request.kind === 'file.lockAcquire') {
      const lockId = await acquireLock(request.sessionId, request.name, request.mode);
      return { kind: 'file.lockAcquire', result: { lockId } };
    }
    releaseLock(requireSession(request.sessionId), request.lockId);
    return { kind: 'file.lockRelease' };
  };

  const dispatchPath = async (request: DesktopHostFilePathRequest): Promise<DesktopHostFileResponse> => {
    requireSession(request.sessionId);
    if (request.kind === 'file.stat') return { kind: 'file.stat', result: await statPath(request.path) };
    if (request.kind === 'file.list') return { kind: 'file.list', result: await listPath(request.path) };

    const target = absolutePath(request.path);
    if (request.kind === 'file.mkdir') {
      await runPathOperation(() => mkdir(target, { recursive: true }), request.path);
      return { kind: 'file.mkdir' };
    }
    if (request.kind === 'file.rmdir') {
      await runPathOperation(() => rm(target, { force: true, recursive: true }), request.path);
      return { kind: 'file.rmdir' };
    }
    await runPathOperation(() => rm(target, { force: true }), request.path);
    return { kind: 'file.remove' };
  };

  const dispatch = async (request: DesktopHostFileRequest): Promise<DesktopHostFileResponse> => {
    if (request.kind === 'file.open') {
      const sessionId = randomUUID();
      sessions.set(sessionId, { writes: new Map(), lockNames: new Map() });
      return { kind: 'file.open', result: { sessionId, protocolVersion: DESKTOP_HOST_PROTOCOL_VERSION } };
    }
    if (request.kind === 'file.close') {
      requireSession(request.sessionId);
      await closeSession(request.sessionId);
      return { kind: 'file.close' };
    }
    if (request.kind === 'file.move') {
      requireSession(request.sessionId);
      await movePath(request.fromPath, request.toPath);
      return { kind: 'file.move' };
    }
    if (request.kind === 'file.read') {
      requireSession(request.sessionId);
      return { kind: 'file.read', result: await readFrame(request.path, request.offset, request.length) };
    }
    if (isWriteRequest(request)) return dispatchWrite(request);
    if (isLockRequest(request)) return dispatchLock(request);
    return dispatchPath(request);
  };

  return {
    handle: async (request: unknown): Promise<DesktopHostFileResponse> => {
      try {
        return await dispatch(parseDesktopHostFileRequest(request));
      } catch (error) {
        return toErrorResponse(error);
      }
    },
    get openSessionCount(): number {
      return sessions.size;
    },
    closeAll: (): void => {
      for (const sessionId of [...sessions.keys()]) void closeSession(sessionId);
    }
  };
}
