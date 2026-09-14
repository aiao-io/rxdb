import type { StorageFileWriter } from '@aiao/rxdb-plugin-storage';
import { describe, expect, it, vi } from 'vitest';
import {
  createWorkerOpenWrite,
  handleWorkerOp,
  OPFS_WORKER_REQUEST_TIMEOUT_MS,
  resolveSyncHandle,
  type OpfsDirectoryHandleLike,
  type OpfsFileHandleLike,
  type OpfsSyncHandleLike,
  type OpfsWorkerPort,
  type OpfsWorkerRequest,
  type OpfsWorkerResponse
} from './opfs-worker-protocol';

/**
 * OPFS 树的结构化替身：只实现协议用到的三个句柄面，行为照抄 OPFS 规范 ——
 * 名字被另一种条目占用时抛 `TypeMismatchError`，不存在且不创建时抛 `NotFoundError`。
 * 协议模块因此可以在不接触任何真实 File System 句柄的环境里跑完行为测试。
 */
class FakeSyncHandle implements OpfsSyncHandleLike {
  readonly chunks: Uint8Array[] = [];
  /** flush / close 的调用次序：close 必须先 flush，半写内容才会落盘。 */
  readonly calls: string[] = [];
  readonly truncateCalls: number[] = [];

  constructor(
    private readonly flushError?: unknown,
    private readonly closeError?: unknown
  ) {}

  write(data: Uint8Array): void {
    this.chunks.push(data);
  }

  async flush(): Promise<void> {
    this.calls.push('flush');
    if (this.flushError !== undefined) throw this.flushError;
  }

  async close(): Promise<void> {
    this.calls.push('close');
    if (this.closeError !== undefined) throw this.closeError;
  }

  truncate(size: number): void {
    this.truncateCalls.push(size);
    this.chunks.length = 0;
  }
}

class FakeFileHandle implements OpfsFileHandleLike {
  readonly syncHandle = new FakeSyncHandle();

  createSyncAccessHandle(): Promise<OpfsSyncHandleLike> {
    return Promise.resolve(this.syncHandle);
  }
}

/** 交付一个指定 sync handle 的文件替身：测试把失败句柄放进 OPFS 树。 */
class FixedFileHandle extends FakeFileHandle {
  constructor(private readonly handle: FakeSyncHandle) {
    super();
  }

  override createSyncAccessHandle(): Promise<OpfsSyncHandleLike> {
    return Promise.resolve(this.handle);
  }
}

/** `createSyncAccessHandle` 恒失败的替身：覆盖 open 失败转错误响应那条路。 */
class UnavailableFileHandle extends FakeFileHandle {
  override createSyncAccessHandle(): Promise<never> {
    return Promise.reject(new DOMException('storage quota exceeded', 'QuotaExceededError'));
  }
}

class FakeDirectoryHandle implements OpfsDirectoryHandleLike {
  readonly children = new Map<string, FakeDirectoryHandle | FakeFileHandle>();

  getDirectoryHandle(name: string, options: { readonly create: boolean }): Promise<OpfsDirectoryHandleLike> {
    const existing = this.children.get(name);
    if (existing instanceof FakeDirectoryHandle) {
      return Promise.resolve(existing);
    }
    if (existing !== undefined) {
      return Promise.reject(new DOMException('a file already uses this name', 'TypeMismatchError'));
    }
    if (!options.create) {
      return Promise.reject(new DOMException('no such directory', 'NotFoundError'));
    }
    const created = new FakeDirectoryHandle();
    this.children.set(name, created);
    return Promise.resolve(created);
  }

  getFileHandle(name: string, options: { readonly create: boolean }): Promise<OpfsFileHandleLike> {
    const existing = this.children.get(name);
    if (existing instanceof FakeFileHandle) {
      return Promise.resolve(existing);
    }
    if (existing !== undefined) {
      return Promise.reject(new DOMException('a directory already uses this name', 'TypeMismatchError'));
    }
    if (!options.create) {
      return Promise.reject(new DOMException('no such file', 'NotFoundError'));
    }
    const created = new FakeFileHandle();
    this.children.set(name, created);
    return Promise.resolve(created);
  }
}

/**
 * worker 端口的结构化替身：记下每一次投递与 transfer 列表，按需回放响应或模拟崩溃。
 * 响应必须显式交付 —— 通道的挂起表在响应到达前不会自清，这也让「未交付」状态可断言。
 */
class FakePort implements OpfsWorkerPort {
  private readonly messageListeners: ((event: MessageEvent) => void)[] = [];
  private readonly errorListeners: ((event: ErrorEvent) => void)[] = [];
  readonly posted: { message: OpfsWorkerRequest; transfer?: Transferable[] }[] = [];
  /** 置为非 undefined 时，下一次 postMessage 同步抛出该值（模拟 DataCloneError）。 */
  throwOnPost: unknown = undefined;
  terminated = 0;

  postMessage(message: unknown, transfer?: Transferable[]): void {
    if (this.throwOnPost !== undefined) throw this.throwOnPost;
    this.posted.push({ message: message as OpfsWorkerRequest, transfer });
  }

  onMessage(listener: (event: MessageEvent) => void): void {
    this.messageListeners.push(listener);
  }

  onError(listener: (event: ErrorEvent) => void): void {
    this.errorListeners.push(listener);
  }

  terminate(): void {
    this.terminated += 1;
  }

  deliver(response: OpfsWorkerResponse): void {
    const event = { data: response } as MessageEvent;
    for (const listener of this.messageListeners) {
      listener(event);
    }
  }

  crash(message = 'storage worker crashed'): void {
    const event = { message } as ErrorEvent;
    for (const listener of this.errorListeners) {
      listener(event);
    }
  }
}

/** 打开一个写句柄并完成一次成功握手，供 write/close/abort 各用例复用。 */
const openWriter = async (port: FakePort): Promise<{ writer: StorageFileWriter }> => {
  const openWrite = createWorkerOpenWrite(port);
  const writerPromise = openWrite(['files', 'a.txt']);
  const opened = port.posted[0].message;
  port.deliver({ id: opened.id, ok: true, handleId: 7 });
  return { writer: await writerPromise };
};

describe('resolveSyncHandle', () => {
  it('逐段创建缺失的父目录，最后一段开文件并返回同步句柄', async () => {
    const root = new FakeDirectoryHandle();

    const handle = await resolveSyncHandle(root, ['notes', 'a.txt']);

    const notes = root.children.get('notes');
    expect(notes).toBeInstanceOf(FakeDirectoryHandle);
    const file = (notes as FakeDirectoryHandle).children.get('a.txt');
    expect(file).toBeInstanceOf(FakeFileHandle);
    expect(handle).toBe((file as FakeFileHandle).syncHandle);
  });

  it('空段列表抛错而不是创建空名字句柄', async () => {
    await expect(resolveSyncHandle(new FakeDirectoryHandle(), [])).rejects.toThrow();
  });

  it('open 后截断为 0：与 base 后端 createWritable 的默认语义对齐', async () => {
    const root = new FakeDirectoryHandle();

    const handle = await resolveSyncHandle(root, ['a.txt']);

    expect(handle).toBeInstanceOf(FakeSyncHandle);
    expect((handle as FakeSyncHandle).truncateCalls).toEqual([0]);
  });

  it('truncate 不可用时 open 失败并释放句柄，绝不带着旧尾字节继续写', async () => {
    const root = new FakeDirectoryHandle();
    const failing = new FakeSyncHandle(undefined, undefined);
    failing.truncate = (): void => {
      failing.truncateCalls.push(0);
      throw new DOMException('truncate not implemented', 'NotSupportedError');
    };
    root.children.set('a.txt', new FixedFileHandle(failing));

    await expect(resolveSyncHandle(root, ['a.txt'])).rejects.toMatchObject({ name: 'NotSupportedError' });
    // 打开失败的句柄必须已释放：泄漏会让同文件后续 createSyncAccessHandle 永久 NoModificationAllowedError。
    expect(failing.calls).toContain('close');
  });
});

describe('handleWorkerOp', () => {
  it('open→write→close 按序生效：分片落句柄、flush 先于 close、句柄出表', async () => {
    const handles = new Map<number, OpfsSyncHandleLike>();
    const root = new FakeDirectoryHandle();

    const opened = await handleWorkerOp({ id: 0, kind: 'open', segments: ['a.txt'] }, root, handles);
    expect(opened.ok).toBe(true);
    const handleId = opened.handleId as number;
    const handle = handles.get(handleId) as FakeSyncHandle;

    const written = await handleWorkerOp(
      { id: 1, kind: 'write', handleId, data: new Uint8Array([1, 2, 3]).buffer },
      root,
      handles
    );
    expect(written).toEqual({ id: 1, ok: true });
    expect(handle.chunks).toHaveLength(1);
    expect([...handle.chunks[0]]).toEqual([1, 2, 3]);

    const closed = await handleWorkerOp({ id: 2, kind: 'close', handleId }, root, handles);
    expect(closed).toEqual({ id: 2, ok: true });
    expect(handle.calls).toEqual(['flush', 'close']);
    expect(handles.has(handleId)).toBe(false);
  });

  it('abort 截断内容并关闭句柄；句柄缺失时幂等成功', async () => {
    const handles = new Map<number, OpfsSyncHandleLike>();
    const root = new FakeDirectoryHandle();
    const opened = await handleWorkerOp({ id: 0, kind: 'open', segments: ['a.txt'] }, root, handles);
    const handleId = opened.handleId as number;
    const handle = handles.get(handleId) as FakeSyncHandle;
    await handleWorkerOp({ id: 1, kind: 'write', handleId, data: new Uint8Array([9]).buffer }, root, handles);

    const aborted = await handleWorkerOp({ id: 2, kind: 'abort', handleId }, root, handles);

    expect(aborted).toEqual({ id: 2, ok: true });
    // 两次截断：open 对齐 base 后端语义的那一次，加上 abort 自己这一次。
    expect(handle.truncateCalls).toEqual([0, 0]);
    expect(handle.calls).toEqual(['close']);
    expect(handles.has(handleId)).toBe(false);

    // 服务层的错误路径可能对同一句柄重复 abort —— 缺失必须静默成功。
    const again = await handleWorkerOp({ id: 3, kind: 'abort', handleId }, root, handles);
    expect(again).toEqual({ id: 3, ok: true });
  });

  it('对不在表中的句柄 write/close 报失败响应，而不是抛到 worker 全局', async () => {
    const root = new FakeDirectoryHandle();

    const written = await handleWorkerOp(
      { id: 1, kind: 'write', handleId: 99, data: new Uint8Array([1]).buffer },
      root,
      new Map()
    );
    expect(written.ok).toBe(false);
    expect(written.error?.name).toBe('Error');
    expect(written.error?.message).toContain('99');

    const closed = await handleWorkerOp({ id: 2, kind: 'close', handleId: 99 }, root, new Map());
    expect(closed.ok).toBe(false);
  });

  it('write 收到非 ArrayBuffer 数据时报失败响应', async () => {
    const handles = new Map<number, OpfsSyncHandleLike>();
    const root = new FakeDirectoryHandle();
    const opened = await handleWorkerOp({ id: 0, kind: 'open', segments: ['a.txt'] }, root, handles);
    const handleId = opened.handleId as number;

    const hostile = { id: 1, kind: 'write', handleId, data: 'not-a-buffer' } as unknown as OpfsWorkerRequest;
    const written = await handleWorkerOp(hostile, root, handles);

    expect(written.ok).toBe(false);
  });

  it('open 失败原样转成失败响应（错误名字与消息都保留）', async () => {
    const root = new FakeDirectoryHandle();
    root.children.set('full', new UnavailableFileHandle());

    const opened = await handleWorkerOp({ id: 0, kind: 'open', segments: ['full'] }, root, new Map());

    expect(opened.ok).toBe(false);
    expect(opened.error).toEqual({ name: 'QuotaExceededError', message: 'storage quota exceeded' });
  });

  it('close 时 flush 失败仍关闭句柄、句柄出表，并报出 flush 错误', async () => {
    const handles = new Map<number, OpfsSyncHandleLike>();
    const root = new FakeDirectoryHandle();
    const failing = new FakeSyncHandle(new DOMException('disk full', 'QuotaExceededError'));
    root.children.set('a.txt', new FixedFileHandle(failing));
    const opened = await handleWorkerOp({ id: 0, kind: 'open', segments: ['a.txt'] }, root, handles);
    const handleId = opened.handleId as number;

    const closed = await handleWorkerOp({ id: 1, kind: 'close', handleId }, root, handles);

    expect(closed.ok).toBe(false);
    expect(closed.error).toEqual({ name: 'QuotaExceededError', message: 'disk full' });
    // flush 失败不能挡住 close 释放句柄：独占句柄泄漏会让同文件后续 open 永久 NoModificationAllowedError。
    expect(failing.calls).toEqual(['flush', 'close']);
    expect(handles.has(handleId)).toBe(false);
  });

  it('flush 成功但 close 失败时报 close 错误，句柄同样出表', async () => {
    const handles = new Map<number, OpfsSyncHandleLike>();
    const root = new FakeDirectoryHandle();
    const failing = new FakeSyncHandle(undefined, new DOMException('handle gone', 'InvalidStateError'));
    root.children.set('a.txt', new FixedFileHandle(failing));
    const opened = await handleWorkerOp({ id: 0, kind: 'open', segments: ['a.txt'] }, root, handles);
    const handleId = opened.handleId as number;

    const closed = await handleWorkerOp({ id: 1, kind: 'close', handleId }, root, handles);

    expect(closed.ok).toBe(false);
    expect(closed.error?.name).toBe('InvalidStateError');
    expect(failing.calls).toEqual(['flush', 'close']);
    expect(handles.has(handleId)).toBe(false);
  });

  it('flush 与 close 都失败时报 flush 错误（耐久性失败优先）', async () => {
    const handles = new Map<number, OpfsSyncHandleLike>();
    const root = new FakeDirectoryHandle();
    const failing = new FakeSyncHandle(
      new DOMException('disk full', 'QuotaExceededError'),
      new DOMException('handle gone', 'InvalidStateError')
    );
    root.children.set('a.txt', new FixedFileHandle(failing));
    const opened = await handleWorkerOp({ id: 0, kind: 'open', segments: ['a.txt'] }, root, handles);
    const handleId = opened.handleId as number;

    const closed = await handleWorkerOp({ id: 1, kind: 'close', handleId }, root, handles);

    expect(closed.ok).toBe(false);
    expect(closed.error?.name).toBe('QuotaExceededError');
    expect(failing.calls).toEqual(['flush', 'close']);
    expect(handles.has(handleId)).toBe(false);
  });
});

describe('createWorkerOpenWrite', () => {
  it('open 请求带完整段列表，响应到达后才得到 writer', async () => {
    const port = new FakePort();

    const writerPromise = createWorkerOpenWrite(port)(['files', 'a.txt']);

    expect(port.posted).toHaveLength(1);
    expect(port.posted[0].message).toEqual({ id: 0, kind: 'open', segments: ['files', 'a.txt'] });
    port.deliver({ id: 0, ok: true, handleId: 7 });
    await expect(writerPromise).resolves.toBeDefined();
  });

  it('open 失败响应让 openWrite 拒绝，错误名字透传', async () => {
    const port = new FakePort();

    const writerPromise = createWorkerOpenWrite(port)(['a.txt']);
    port.deliver({ id: 0, ok: false, error: { name: 'QuotaExceededError', message: 'quota' } });

    await expect(writerPromise).rejects.toMatchObject({ name: 'QuotaExceededError', message: 'quota' });
  });

  it('write 以 transfer 搬运协议自己的 ArrayBuffer 副本，调用方视图不被 detach', async () => {
    const port = new FakePort();
    const { writer } = await openWriter(port);

    const data = new Uint8Array([1, 2, 3]);
    const pendingWrite = writer.write(data);
    // write 的分片搬运在 `await toArrayBuffer` 之后投递：断言前先等消息落到端口上。
    await vi.waitFor(() => expect(port.posted).toHaveLength(2));
    const posted = port.posted[1];
    const postedData = (posted.message as { data: ArrayBuffer }).data;
    expect([...new Uint8Array(postedData)]).toEqual([1, 2, 3]);
    // 进 transfer 列表的必须是通道自己的副本：把调用方的 buffer 交出去会随 transfer
    // 被 detach（视图 byteLength 归 0），所有权语义与下面的子视图分支不一致。
    expect(postedData).not.toBe(data.buffer);
    expect(posted.transfer).toEqual([postedData]);
    expect(data.byteLength).toBe(3);
    port.deliver({ id: 1, ok: true });
    await pendingWrite;

    // 调用方从流里读到的分片可能只是大 buffer 的一段视图：搬运时必须切成精确区间，
    // 否则 worker 会把它当整块 buffer 写，文件里长出别的分片的字节。
    const big = new Uint8Array(8).fill(7);
    big.set([5, 6, 8], 3);
    const view = big.subarray(3, 6);
    const pendingView = writer.write(view);
    await vi.waitFor(() => expect(port.posted).toHaveLength(3));
    const transfer = port.posted[2].transfer as Transferable[];
    expect(transfer[0]).not.toBe(big.buffer);
    expect([...new Uint8Array(transfer[0] as ArrayBuffer)]).toEqual([5, 6, 8]);
    port.deliver({ id: 2, ok: true });
    await pendingView;
  });

  it('write 把 Blob 转成 ArrayBuffer 再搬运', async () => {
    const port = new FakePort();
    const { writer } = await openWriter(port);

    const pendingWrite = writer.write(new Blob(['abc']));
    await vi.waitFor(() => expect(port.posted).toHaveLength(2));
    const posted = port.posted[1];
    expect(new TextDecoder().decode(new Uint8Array((posted.message as { data: ArrayBuffer }).data))).toBe('abc');
    expect(posted.transfer).toEqual([(posted.message as { data: ArrayBuffer }).data]);
    port.deliver({ id: 1, ok: true });
    await pendingWrite;
  });

  it('close 发送提交请求，失败响应带错误名字拒绝', async () => {
    const port = new FakePort();
    const { writer } = await openWriter(port);

    const pendingClose = writer.close();
    expect(port.posted[1].message).toEqual({ id: 1, kind: 'close', handleId: 7 });
    port.deliver({ id: 1, ok: false, error: { name: 'StorageError', message: 'commit failed' } });

    await expect(pendingClose).rejects.toMatchObject({ name: 'StorageError' });
  });

  it('abort 永不拒绝：worker 回失败响应也照吞', async () => {
    const port = new FakePort();
    const { writer } = await openWriter(port);

    const pendingAbort = writer.abort('cancelled');
    expect(port.posted[1].message).toEqual({ id: 1, kind: 'abort', handleId: 7 });
    port.deliver({ id: 1, ok: false, error: { name: 'StorageError', message: 'truncate failed' } });

    await expect(pendingAbort).resolves.toBeUndefined();
  });

  it('worker 崩溃拒绝所有挂起请求，之后的请求立即失败而不继续投递', async () => {
    const port = new FakePort();
    const { writer } = await openWriter(port);

    const first = writer.write(new Uint8Array([1]));
    const second = writer.write(new Uint8Array([2]));
    port.crash('boom');

    await expect(first).rejects.toMatchObject({ name: 'OpfsWorkerError' });
    await expect(second).rejects.toMatchObject({ name: 'OpfsWorkerError' });

    const postedBefore = port.posted.length;
    await expect(writer.write(new Uint8Array([3]))).rejects.toMatchObject({ name: 'OpfsWorkerError' });
    expect(port.posted.length).toBe(postedBefore);
  });

  it('不认识 id 的响应被忽略，不影响挂起请求', async () => {
    const port = new FakePort();
    const { writer } = await openWriter(port);

    const pendingWrite = writer.write(new Uint8Array([1]));
    // 响应在请求落到端口上之后才有意义：提前投递会撞上空挂起表，被当成陌生 id 丢掉。
    await vi.waitFor(() => expect(port.posted).toHaveLength(2));
    port.deliver({ id: 99, ok: true, handleId: 1 });
    port.deliver({ id: 1, ok: true });

    await expect(pendingWrite).resolves.toBeUndefined();
  });

  it('worker 无响应时挂起请求在时限后以超时失败结算，而不是永远等', async () => {
    vi.useFakeTimers();
    try {
      const port = new FakePort();
      const { writer } = await openWriter(port);

      const pendingWrite = writer.write(new Uint8Array([1]));
      await vi.waitFor(() => expect(port.posted).toHaveLength(2));
      await vi.advanceTimersByTimeAsync(OPFS_WORKER_REQUEST_TIMEOUT_MS);

      await expect(pendingWrite).rejects.toMatchObject({ name: 'OpfsWorkerTimeout' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('terminate 后在途写请求不再永久挂死：时限后失败结算', async () => {
    vi.useFakeTimers();
    try {
      const port = new FakePort();
      const { writer } = await openWriter(port);

      const pendingWrite = writer.write(new Uint8Array([1]));
      await vi.waitFor(() => expect(port.posted).toHaveLength(2));
      // dispose 路径：terminate 不触发 error 事件，也没有任何响应会来。
      port.terminate();
      await vi.advanceTimersByTimeAsync(OPFS_WORKER_REQUEST_TIMEOUT_MS);

      await expect(pendingWrite).rejects.toMatchObject({ name: 'OpfsWorkerTimeout' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('postMessage 同步抛错时请求以结构化失败结算，且不留下死条目挡住同 id 响应', async () => {
    const port = new FakePort();
    const { writer } = await openWriter(port);

    const cloneError = new DOMException('payload could not be cloned', 'DataCloneError');
    port.throwOnPost = cloneError;
    await expect(writer.write(new Uint8Array([1]))).rejects.toMatchObject({ name: 'DataCloneError' });

    // 通道恢复后照常可用：那次失败占用的 id 已出表，迟到响应不会串到新请求上。
    // posted 只多一条：失败的投递在 push 之前就抛了，不存在半条消息。
    port.throwOnPost = undefined;
    const pendingWrite = writer.write(new Uint8Array([2]));
    await vi.waitFor(() => expect(port.posted).toHaveLength(2));
    port.deliver({ id: 2, ok: true });
    await expect(pendingWrite).resolves.toBeUndefined();
  });
});
