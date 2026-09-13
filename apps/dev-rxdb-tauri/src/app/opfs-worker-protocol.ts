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
 * `flush` 允许同步返回：TS 6.0 的 lib.dom 里它是 `void`，而部分实现返回 Promise ——
 * 分派处一律 `await`，两种形态等价。
 */
export interface OpfsSyncHandleLike {
  write(data: Uint8Array): void;
  flush(): void | Promise<void>;
  close(): Promise<void>;
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
  return file.createSyncAccessHandle();
};

/**
 * 把任意失败折成结构化失败响应：错误只以名字与消息出 worker，不跨线程抛异常。
 *
 * @remarks
 * 名字与消息**结构化**读取而不是 `instanceof`：`DOMException` 在部分实现里不继承
 * `Error`（happy-dom 就是），且经消息通道还原的错误本来就不是实例 ——
 * 与 storage 包 `isStorageNotFoundError` 的结构化判定同一理由。
 */
const failure = (id: number, error: unknown): OpfsWorkerResponse => {
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
        return failure(request.id, new Error('storage worker open requires path segments'));
      }
      try {
        const handle = await resolveSyncHandle(root, request.segments);
        const handleId = (nextHandleId += 1);
        handles.set(handleId, handle);
        return { id: request.id, ok: true, handleId };
      } catch (error) {
        return failure(request.id, error);
      }
    }
    case 'write': {
      const handle = handles.get(request.handleId);
      if (handle === undefined || !(request.data instanceof ArrayBuffer)) {
        return failure(request.id, new Error(`storage worker write on missing handle ${request.handleId}`));
      }
      try {
        handle.write(new Uint8Array(request.data));
        return { id: request.id, ok: true };
      } catch (error) {
        return failure(request.id, error);
      }
    }
    case 'close': {
      const handle = handles.get(request.handleId);
      if (handle === undefined) {
        return failure(request.id, new Error(`storage worker close on missing handle ${request.handleId}`));
      }
      try {
        await handle.flush();
        await handle.close();
        return { id: request.id, ok: true };
      } catch (error) {
        return failure(request.id, error);
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

/** 把分片折成可转移的 ArrayBuffer：Blob 读入；视图按精确区间切片，绝不搬运多余字节。 */
const toArrayBuffer = async (chunk: Blob | Uint8Array<ArrayBuffer>): Promise<ArrayBuffer> => {
  if (chunk instanceof Uint8Array) {
    const { buffer, byteOffset, byteLength } = chunk;
    if (byteOffset === 0 && byteLength === buffer.byteLength) {
      return buffer;
    }
    return buffer.slice(byteOffset, byteOffset + byteLength);
  }
  return chunk.arrayBuffer();
};

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
 * abort 吞掉一切失败（含 worker 已死）：它与 {@link StorageFileWriter.abort} 一样
 * 只在错误处理路径上被调用，二次抛错会盖住真正的失败原因。
 */
export const createWorkerOpenWrite = (
  port: OpfsWorkerPort
): ((segments: readonly string[]) => Promise<StorageFileWriter>) => {
  let nextRequestId = 0;
  let crashed = false;
  const pending = new Map<number, (response: OpfsWorkerResponse) => void>();

  port.onMessage(event => {
    const response = event.data as OpfsWorkerResponse;
    const resolve = pending.get(response.id);
    if (resolve === undefined) {
      return;
    }
    pending.delete(response.id);
    resolve(response);
  });

  port.onError(event => {
    crashed = true;
    for (const resolve of pending.values()) {
      resolve({ id: -1, ok: false, error: { name: 'OpfsWorkerError', message: event.message } });
    }
    pending.clear();
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
      pending.set(id, resolve);
      port.postMessage({ id, ...payload }, transfer);
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
