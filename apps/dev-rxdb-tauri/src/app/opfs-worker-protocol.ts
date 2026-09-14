/**
 * @fileoverview OPFS 写通道协议：页侧 channel 与 worker 侧分派
 *
 * WKWebView 的页面上下文没有 `FileSystemFileHandle.createWritable`（storage 插件的默认
 * OPFS 后端因此写不进去），worker 上下文却有 `createSyncAccessHandle` —— 本模块把
 * 「打开可写句柄」这一件事拆到 worker 里做，读与目录操作留在页面侧委托插件默认后端。
 *
 * 协议刻意只做**单步句柄动作**（open / write / close / abort）：路径校验、回滚补偿、
 * 临时文件提交这些语义留在 storage 服务层，通道只搬运字节，不搬运状态机 ——
 * 否则两个后端的事务行为会从这里开始分叉（与 {@link StorageFilesystem} 的边界约定同源）。
 *
 * 文件路径在消息里以**段列表**形式传递：worker 从 OPFS 根开始逐段解析，与页面侧 base
 * 后端的物理布局（`navigator.storage.getDirectory()` → rootDir 段 → 文件段）完全一致，
 * 写入因此落在 base 读得到的位置。段列表由调用方（`opfs-worker-filesystem.ts`）拼接，
 * 其输入是服务层已规范化的路径 —— 见 `storage-filesystem.ts` 的边界约定。
 */

import type { StorageFileWriter } from '@aiao/rxdb-plugin-storage';

/**
 * `FileSystemDirectoryHandle` 的结构化子集。
 *
 * @remarks
 * 结构类型而不是 DOM 类型：worker 分派逻辑的行为测试在 fake OPFS 树上跑，
 * 不接触真实句柄；DOM 的 `FileSystemDirectoryHandle` 结构上满足本接口，无需适配。
 */
export interface OpfsDirectoryHandleLike {
  getDirectoryHandle(name: string, options: { readonly create: boolean }): Promise<OpfsDirectoryHandleLike>;
  getFileHandle(name: string, options: { readonly create: boolean }): Promise<OpfsFileHandleLike>;
}

/** `FileSystemFileHandle` 的结构化子集。 */
export interface OpfsFileHandleLike {
  createSyncAccessHandle(): Promise<OpfsSyncHandleLike>;
}

/**
 * `FileSystemSyncAccessHandle` 的结构化子集。
 *
 * @remarks
 * `flush` 与 `close` 允许同步返回：TS 6.0 的 lib.dom 里它们是 `void`，而部分实现返回
 * Promise —— 分派处一律 `await`，两种形态等价。
 */
export interface OpfsSyncHandleLike {
  write(data: Uint8Array): void;
  flush(): void | Promise<void>;
  close(): void | Promise<void>;
  truncate(size: number): void;
}

/** 打开文件写入句柄：段列表是文件在 OPFS 根下的完整物理路径。 */
export interface OpfsWorkerOpenRequest {
  readonly id: number;
  readonly kind: 'open';
  readonly segments: readonly string[];
}

/** 追加一个分片；`data` 随消息以 transfer 搬运，投递后页侧不再持有。 */
export interface OpfsWorkerWriteRequest {
  readonly id: number;
  readonly kind: 'write';
  readonly handleId: number;
  readonly data: ArrayBuffer;
}

/** 提交（close）或丢弃（abort）本次写入。 */
export interface OpfsWorkerCloseRequest {
  readonly id: number;
  readonly kind: 'close' | 'abort';
  readonly handleId: number;
}

/**
 * 页侧投递给 worker 的请求联合：open 携带段列表，write 携带随消息转移的分片，
 * close / abort 只凭 handleId 定位句柄。
 */
export type OpfsWorkerRequest = OpfsWorkerOpenRequest | OpfsWorkerWriteRequest | OpfsWorkerCloseRequest;

/** 与请求 id 一一对应的响应；`ok: true` 时 open 响应附上新分配的 `handleId`。 */
export interface OpfsWorkerResponse {
  readonly id: number;
  readonly ok: boolean;
  readonly handleId?: number;
  readonly error?: { readonly name: string; readonly message: string };
}

/** worker 端的分发表由入口模块持有，`handleWorkerOp` 只负责单条消息的语义。 */
export type OpfsWorkerHandleTable = Map<number, OpfsSyncHandleLike>;

/** 供 open 响应分配的句柄 id；单调递增，进程内唯一。 */
let nextHandleId = 0;

/**
 * 从 OPFS 根逐段解析到文件，并打开同步写入句柄；缺失的父目录一并创建。
 *
 * @param root - OPFS 根目录句柄
 * @param segments - 文件在根下的完整段列表（rootDir 段 + 文件路径段），至少一段
 * @returns 已打开的同步写入句柄
 *
 * @remarks
 * 解析方式与 storage 插件默认 OPFS 后端的 `getRootHandle` / `getFileHandle` 一致：
 * 父目录段用 `{ create: true }` 逐级创建，最后一段开文件 —— 两边因此指向同一物理位置，
 * 页面侧 base 读得到 worker 写进去的内容。
 *
 * 打开后截断为 0，对齐 base 后端 `createWritable()` 的默认语义（`keepExistingData:
 * false`）：文件已存在时，不截断会让一次更短的覆写留下旧尾字节——例如把 512 字节的
 * 备份还原进 4096 字节的库文件，读出来是 512 字节有效内容加 3584 字节旧页。截断不可用
 * （老实现没有 `truncate`）时整个 open 失败并释放句柄，交服务层补偿，绝不带着旧尾字节
 * 继续写。
 */
export const resolveSyncHandle = async (
  root: OpfsDirectoryHandleLike,
  segments: readonly string[]
): Promise<OpfsSyncHandleLike> => {
  if (segments.length === 0) {
    throw new Error('storage worker open requires a non-empty path');
  }

  let directory = root;
  for (const segment of segments.slice(0, -1)) {
    directory = await directory.getDirectoryHandle(segment, { create: true });
  }

  const file = await directory.getFileHandle(segments[segments.length - 1], { create: true });
  const handle = await file.createSyncAccessHandle();
  try {
    handle.truncate(0);
  } catch (error) {
    await closeQuietly(handle);
    throw error;
  }
  return handle;
};

/** 尽力关闭句柄：清理路径上关闭失败不得盖住真正的错误。 */
const closeQuietly = async (handle: OpfsSyncHandleLike): Promise<void> => {
  try {
    await handle.close();
  } catch {
    // 句柄已不可用：这里没有可做的补救，唯一职责是别把清理失败抛给调用方。
  }
};

/**
 * 把任意失败折成结构化失败响应：错误只以名字与消息出 worker，不跨线程抛异常。
 *
 * @remarks
 * 名字与消息**结构化**读取而不是 `instanceof`：`DOMException` 在部分实现里不继承
 * `Error`（happy-dom 就是），且经消息通道还原的错误本来就不是实例 ——
 * 与 storage 包 `isStorageNotFoundError` 的结构化判定同一理由。
 */
export const failureResponse = (id: number, error: unknown): OpfsWorkerResponse => {
  if (error instanceof Error) {
    return { id, ok: false, error: { name: error.name, message: error.message } };
  }
  if (typeof error === 'object' && error !== null && 'name' in error) {
    const name = (error as { name?: unknown }).name;
    const message = (error as { message?: unknown }).message;
    return {
      id,
      ok: false,
      error: {
        name: typeof name === 'string' && name !== '' ? name : 'Error',
        message: typeof message === 'string' ? message : String(error)
      }
    };
  }
  return { id, ok: false, error: { name: 'Error', message: String(error) } };
};

/**
 * 提交关闭句柄：flush 先于 close；flush 失败不能挡住 close 释放句柄。
 *
 * @param handle - 要提交的句柄
 * @returns 提交过程中的首个错误（flush 优先于 close），成功时为 `undefined`
 *
 * @remarks
 * 与 abort 分支的「分两段 try」同一条理由：flush 失败（配额、文件被移除）时句柄必须
 * 照样关闭——OPFS 同文件只允许一个 sync handle，泄漏会让后续所有 `createSyncAccessHandle`
 * 都抛 `NoModificationAllowedError`，直到 worker 终止。flush 失败只说明内容没有持久化，
 * 那件事由服务层的快照补偿负责。
 */
const commitClose = async (handle: OpfsSyncHandleLike): Promise<unknown> => {
  let commitError: unknown;
  try {
    await handle.flush();
  } catch (error) {
    commitError = error;
  }
  try {
    await handle.close();
  } catch (error) {
    commitError ??= error;
  }
  return commitError;
};

/**
 * 处理一条 worker 请求，返回同 id 的响应。
 *
 * @param request - 页侧投递的请求
 * @param root - OPFS 根目录句柄，由入口模块注入（保持分派逻辑不依赖 `navigator` 全局）
 * @param handles - 打开的句柄表，由入口模块持有
 * @returns 与请求 id 对应的响应；任何失败都以 `ok: false` 的响应返回，**不抛出**
 *
 * @remarks
 * abort 语义与 `StorageFileWriter.abort` 的契约对齐：截断 + 关闭，句柄无论如何出表，
 * 恒回 `ok: true` —— 服务层已在错误路径上对它补偿（快照还原），abort 自身不得再抛。
 * 截断与关闭分两段 try：老实现可能没有 `truncate`，它失败不能挡住 close 释放句柄。
 */
export const handleWorkerOp = async (
  request: OpfsWorkerRequest,
  root: OpfsDirectoryHandleLike,
  handles: OpfsWorkerHandleTable
): Promise<OpfsWorkerResponse> => {
  switch (request.kind) {
    case 'open': {
      if (!Array.isArray(request.segments)) {
        return failureResponse(request.id, new Error('storage worker open requires path segments'));
      }
      try {
        const handle = await resolveSyncHandle(root, request.segments);
        const handleId = (nextHandleId += 1);
        handles.set(handleId, handle);
        return { id: request.id, ok: true, handleId };
      } catch (error) {
        return failureResponse(request.id, error);
      }
    }
    case 'write': {
      const handle = handles.get(request.handleId);
      if (handle === undefined || !(request.data instanceof ArrayBuffer)) {
        return failureResponse(request.id, new Error(`storage worker write on missing handle ${request.handleId}`));
      }
      try {
        handle.write(new Uint8Array(request.data));
        return { id: request.id, ok: true };
      } catch (error) {
        return failureResponse(request.id, error);
      }
    }
    case 'close': {
      const handle = handles.get(request.handleId);
      if (handle === undefined) {
        return failureResponse(request.id, new Error(`storage worker close on missing handle ${request.handleId}`));
      }
      try {
        const commitError = await commitClose(handle);
        if (commitError !== undefined) {
          return failureResponse(request.id, commitError);
        }
        return { id: request.id, ok: true };
      } finally {
        // 提交失败后句柄不再可用：半写内容由服务层的快照补偿负责还原或删除。
        handles.delete(request.handleId);
      }
    }
    case 'abort': {
      const handle = handles.get(request.handleId);
      handles.delete(request.handleId);
      if (handle === undefined) {
        // 服务层的错误路径可能对同一句柄重复 abort —— 缺失视为已完成。
        return { id: request.id, ok: true };
      }
      try {
        handle.truncate(0);
      } catch {
        // 老实现可能没有 truncate：文件停留在半写状态，由服务层补偿，abort 本身不抛。
      }
      try {
        await handle.close();
      } catch {
        // 同上：abort 恒成功，句柄已出表。
      }
      return { id: request.id, ok: true };
    }
  }
};

/**
 * worker 端口的结构化子集：通道只依赖三个动作，Worker / 测试替身各自满足。
 *
 * @remarks
 * `onMessage` / `onError` 用注册方法而不是 `addEventListener` 重载：DOM 的
 * `addEventListener` 按事件名重载，结构化替身无法用一个实现同时满足全部签名。
 */
export interface OpfsWorkerPort {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onMessage(listener: (event: MessageEvent) => void): void;
  onError(listener: (event: ErrorEvent) => void): void;
  terminate(): void;
}

/** 请求体的 id 由通道分配，投递时拼上。 */
type OpfsWorkerRequestPayload =
  Omit<OpfsWorkerOpenRequest, 'id'> | Omit<OpfsWorkerWriteRequest, 'id'> | Omit<OpfsWorkerCloseRequest, 'id'>;

/** 把失败响应折成带名字的 Error，供 writer 的调用方按 `error.name` 分支。 */
const errorFrom = (error: { readonly name: string; readonly message: string } | undefined): Error => {
  const thrown = new Error(error?.message ?? 'storage worker failed');
  if (error !== undefined) {
    thrown.name = error.name;
  }
  return thrown;
};

/**
 * 把分片折成可转移的 ArrayBuffer：Blob 读入；视图按精确区间切片，绝不搬运多余字节。
 *
 * @remarks
 * 整视图同样切片：把调用方的 buffer 原样交出去会让它随 transfer 被 detach，调用方视图的
 * `byteLength` 归 0——所有权不能越过 write 边界。副本属于通道，进 transfer 列表的是
 * 通道自己的内存，调用方的视图始终可用。
 */
const toArrayBuffer = async (chunk: Blob | Uint8Array<ArrayBuffer>): Promise<ArrayBuffer> => {
  if (chunk instanceof Uint8Array) {
    const { buffer, byteOffset, byteLength } = chunk;
    return buffer.slice(byteOffset, byteOffset + byteLength);
  }
  return chunk.arrayBuffer();
};

/**
 * 单条请求的结算上限。
 *
 * @remarks
 * worker 被 terminate、消息反序列化失败（messageerror）、或脚本死亡时都不会有响应到来，
 * 而 `terminate()` 不触发 error 事件——挂起请求没有这个时限就会永远等一个到不了的响应
 * （dispose 时正在写的调用方就是死锁）。写入本身是毫秒级的同步句柄动作，60 秒只兜
 * 「通道已经死了」这一种形态，不误伤慢盘。
 */
export const OPFS_WORKER_REQUEST_TIMEOUT_MS = 60_000;

/**
 * 打开一条页 → worker 的写入通道。
 *
 * @param port - worker 端口（真实 Worker 或测试替身）
 * @returns 段列表 → 写句柄的工厂；每次调用在 worker 端打开一个独立句柄
 *
 * @remarks
 * 通道为端口上的所有请求共用一个 id 序与挂起表：响应按 id 对齐，不认识 id 的响应
 * 直接忽略。worker 一旦报 error（崩溃或脚本失败），挂起请求全部拒绝，之后的请求
 * 立即失败 —— 不再向死 worker 投递，否则 abort 会永远等一个到不了的响应。
 *
 * 每一条挂起请求都带 {@link OPFS_WORKER_REQUEST_TIMEOUT_MS} 的结算上限：terminate 与
 * messageerror 都不触发 error 事件，没有时限的请求在 dispose 时就是死锁。postMessage
 * 自身同步抛错（DataCloneError）也当场以结构化失败结算，不留下死条目。
 *
 * abort 吞掉一切失败（含 worker 已死）：它与 {@link StorageFileWriter.abort} 一样
 * 只在错误处理路径上被调用，二次抛错会盖住真正的失败原因。
 */
export const createWorkerOpenWrite = (
  port: OpfsWorkerPort
): ((segments: readonly string[]) => Promise<StorageFileWriter>) => {
  let nextRequestId = 0;
  let crashed = false;
  const pending = new Map<
    number,
    { resolve: (response: OpfsWorkerResponse) => void; timer: ReturnType<typeof setTimeout> }
  >();

  /** 结算一条挂起请求并收回它的时限计时器；不认识 id 的响应在这里被静默忽略。 */
  const settle = (id: number, response: OpfsWorkerResponse): void => {
    const entry = pending.get(id);
    if (entry === undefined) {
      return;
    }
    clearTimeout(entry.timer);
    pending.delete(id);
    entry.resolve(response);
  };

  port.onMessage(event => {
    settle((event.data as OpfsWorkerResponse).id, event.data as OpfsWorkerResponse);
  });

  port.onError(event => {
    crashed = true;
    for (const id of [...pending.keys()]) {
      settle(id, { id: -1, ok: false, error: { name: 'OpfsWorkerError', message: event.message } });
    }
  });

  const request = (payload: OpfsWorkerRequestPayload, transfer?: Transferable[]): Promise<OpfsWorkerResponse> => {
    if (crashed) {
      return Promise.resolve({
        id: -1,
        ok: false,
        error: { name: 'OpfsWorkerError', message: 'storage worker crashed' }
      });
    }
    return new Promise(resolve => {
      const id = nextRequestId++;
      const timer = setTimeout(() => {
        settle(id, {
          id,
          ok: false,
          error: { name: 'OpfsWorkerTimeout', message: 'storage worker did not respond in time' }
        });
      }, OPFS_WORKER_REQUEST_TIMEOUT_MS);
      pending.set(id, { resolve, timer });
      try {
        port.postMessage({ id, ...payload }, transfer);
      } catch (error) {
        // 同步抛错（DataCloneError 等）也按通道的错误模型结算：调用方拿到结构化失败，
        // 挂起表里不留死条目。
        settle(id, failureResponse(id, error));
      }
    });
  };

  return async segments => {
    const opened = await request({ kind: 'open', segments });
    if (!opened.ok || opened.handleId === undefined) {
      throw errorFrom(opened.error);
    }
    const handleId = opened.handleId;

    return {
      async write(chunk: Blob | Uint8Array<ArrayBuffer>): Promise<void> {
        const data = await toArrayBuffer(chunk);
        const written = await request({ kind: 'write', handleId, data }, [data]);
        if (!written.ok) {
          throw errorFrom(written.error);
        }
      },
      async close(): Promise<void> {
        const closed = await request({ kind: 'close', handleId });
        if (!closed.ok) {
          throw errorFrom(closed.error);
        }
      },
      async abort(): Promise<void> {
        await request({ kind: 'abort', handleId }).catch(() => undefined);
      }
    };
  };
};
