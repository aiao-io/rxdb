/**
 * @fileoverview 浏览器 OPFS 的 `files` provider：列目录、下载、上传、建目录与删除。
 *
 * @remarks
 * 这是 US-904 阶段 C2 把「私有 OPFS 状态机」换成「阶段 B descriptor + provider」的落点。
 * 三处需要先说清楚的取舍：
 *
 * 1. **`list` 交出子树，不是一层。** 旧实现一次性读出整棵 OPFS 树，面板整棵渲染。
 *    改成按层懒加载会改变用户可见行为（AC#42 只允许数据库导出这一处变），
 *    所以这里保持子树语义。分页是阶段 D 的 AC#48 针对**原生**文件后端的问题——
 *    那里的目录规模不受同源配额约束，这里受。
 *
 * 2. **`download` 的字节不过 wire。** connector→panel 这一向已经在阶段 D 补齐（见
 *    `v2/endpoint.ts` 的出站泵与 `v2/panel-endpoint.ts` 的 `download`），但 `opfs` kind
 *    **仍然主动不用它**：字节本来就在这个源里，把它 base64 一遍再送回同一个源只是更慢
 *    更占内存。所以这里的 `createChunkSource` 恒为 `undefined`，面板拿到的是
 *    `delivered-at-source`——这**不是**「不支持下载」，descriptor 里 `download` 照常宣告。
 *
 * 3. **上传的目标文件在 `commit()` 之前不存在。** 先写同名临时文件、commit 时再改名，
 *    而不是直接 `createWritable()` 写目标句柄——后者会让半写文件对同源的其它读者可见，
 *    而传输的终态里「取消」「超时」「写失败」三条路都会留下这样一个文件。
 *
 * @module @aiao/rxdb-devtools/browser/opfs-files-provider
 */

import type { DevToolsProviderDescriptor, DevToolsProviderRuntime } from '../provider/descriptor.js';
import { isValidPathSegment, joinLogicalPath, parseLogicalPath, splitLogicalPath } from '../provider/logical-path.js';
import type { DevToolsChunkSink, DevToolsProvider, DevToolsProviderResult } from '../provider/types.js';
import { createProviderError, mapPlatformError } from '../v2/error-mapping.js';
import type { DevToolsProviderErrorCode } from '../v2/errors.js';
import { isRecord, isSafeIntegerInRange } from '../v2/guards.js';

/** 一条目录项；`entries` 只在目录上出现。 */
export type DevToolsOpfsEntry =
  | {
      readonly name: string;
      readonly kind: 'directory';
      readonly path: string;
      readonly entries: readonly DevToolsOpfsEntry[];
    }
  | {
      readonly name: string;
      readonly kind: 'file';
      readonly path: string;
      readonly size: number;
      readonly lastModified: number;
    };

/** OPFS provider 的构造端口。 */
export interface DevToolsOpfsFilesProviderPorts {
  /** OPFS 根目录的唯一入口；provider 不直接碰 `navigator`。 */
  getRootDirectory(): Promise<FileSystemDirectoryHandle>;
  /** descriptor 声明的单次传输上限。 */
  readonly maxTransferBytes: number;
  /**
   * descriptor 显示用 runtime；缺省 `browser`。
   *
   * @remarks
   * OPFS 不是浏览器专有——Tauri / Electron 的 webview 里同样能落在 OPFS 上。写死 `browser`
   * 会让这些宿主的一套 descriptor 自相矛盾（`database` 报 `tauri`、`files` 报 `browser`），
   * 面板据此说不清自己连的是谁。该字段只进显示，不参与任何行为判定。
   */
  readonly runtime?: DevToolsProviderRuntime;
  /**
   * 把一个文件交给页面自己的保存路径。
   *
   * @remarks
   * 省略即不保存，只回元数据——单测与不具备 DOM 的宿主用这一形态。见模块头第 2 条。
   */
  saveToDisk?(file: File, name: string): Promise<void>;
}

/** OPFS `files` provider；额外暴露与 transferId 绑定的 sink 工厂。 */
export interface DevToolsOpfsFilesProvider extends DevToolsProvider {
  /**
   * 取一次已登记上传的落盘接收器。
   *
   * @param transferId - `upload` 请求里声明的传输 ID。
   * @throws 该 ID 没有登记过的上传时抛出——无主 sink 会把一处接线错误写成一个真实文件。
   * @returns 该次传输的 sink。
   */
  createChunkSink(transferId: string): DevToolsChunkSink;
}

/** 临时文件名前缀；commit 时改名到目标名。 */
const TEMPORARY_PREFIX = '.rxdb-devtools-upload-';

interface PendingUpload {
  /**
   * 目标目录，以**未决 promise** 的形式登记。
   *
   * @remarks
   * 不是句柄本身：登记必须发生在 `upload` 的第一个 `await` 之前（理由见 {@link upload}），
   * 而那时目录还没解析出来。sink 的每个入口都会 await 它，代价只是把等待推迟到真正
   * 要用句柄的那一刻。
   */
  readonly directory: Promise<FileSystemDirectoryHandle>;
  readonly name: string;
  readonly temporaryName: string;
}

function failure(code: DevToolsProviderErrorCode): DevToolsProviderResult {
  return { outcome: 'failed', error: createProviderError(code) };
}

function ok(result: unknown): DevToolsProviderResult {
  return { outcome: 'ok', result };
}

/** DOMException → 共享错误码；非 DOM 值不在这里嗅探，交给共享映射兜到 `operation_failed`。 */
function mapped(error: unknown): DevToolsProviderResult {
  return { outcome: 'failed', error: mapPlatformError('dom', error) };
}

async function resolveDirectory(
  root: FileSystemDirectoryHandle,
  segments: readonly string[],
  create: boolean
): Promise<FileSystemDirectoryHandle> {
  let current = root;
  for (const segment of segments) {
    current = await current.getDirectoryHandle(segment, { create });
  }
  return current;
}

async function readSubtree(handle: FileSystemDirectoryHandle, base: string): Promise<readonly DevToolsOpfsEntry[]> {
  const entries: DevToolsOpfsEntry[] = [];
  const iterable = handle.entries() as AsyncIterable<[string, FileSystemHandle]>;

  for await (const [name, child] of iterable) {
    const path = base.length > 0 ? `${base}/${name}` : name;
    if (child.kind === 'directory') {
      const nested = await readSubtree(child as FileSystemDirectoryHandle, path);
      entries.push({ name, kind: 'directory', path, entries: nested });
      continue;
    }
    const file = await (child as FileSystemFileHandle).getFile();
    entries.push({ name, kind: 'file', path, size: file.size, lastModified: file.lastModified });
  }
  return entries;
}

/**
 * 建一个浏览器 OPFS 的 `files` provider。
 *
 * @param ports - OPFS 根入口、传输上限与可选的页面保存路径。
 * @returns 可直接装进 `DevToolsProviderRegistry` 的 provider。
 */
export function createDevToolsOpfsFilesProvider(ports: DevToolsOpfsFilesProviderPorts): DevToolsOpfsFilesProvider {
  const uploads = new Map<string, PendingUpload>();
  let temporarySequence = 0;

  const descriptor: DevToolsProviderDescriptor = {
    domain: 'files',
    version: 1,
    kind: 'opfs',
    operations: ['list', 'download', 'upload', 'create-directory', 'delete'],
    runtime: ports.runtime ?? 'browser',
    limits: { maxTransferBytes: ports.maxTransferBytes }
  };

  async function list(params: Record<string, unknown>): Promise<DevToolsProviderResult> {
    const segments = parseLogicalPath(params['path']);
    if (segments === undefined) return failure('invalid_path');
    const path = joinLogicalPath(segments);
    const handle = await resolveDirectory(await ports.getRootDirectory(), segments, false);
    return ok({ path, entries: await readSubtree(handle, path) });
  }

  async function download(params: Record<string, unknown>): Promise<DevToolsProviderResult> {
    const target = splitLogicalPath(params['path']);
    if (target === undefined) return failure('invalid_path');

    const directory = await resolveDirectory(await ports.getRootDirectory(), target.parent, false);
    const file = await (await directory.getFileHandle(target.name, { create: false })).getFile();
    await ports.saveToDisk?.(file, target.name);
    return ok({ path: params['path'], name: target.name, size: file.size });
  }

  async function upload(params: Record<string, unknown>): Promise<DevToolsProviderResult> {
    const transferId = params['transferId'];
    const segments = parseLogicalPath(params['path']);
    const name = params['name'];
    if (typeof transferId !== 'string' || transferId.length === 0) return failure('invalid_path');
    if (segments === undefined || !isValidPathSegment(name)) return failure('invalid_path');
    if (!isSafeIntegerInRange(params['size'], 0, ports.maxTransferBytes)) return failure('transfer_size_exceeded');
    if (uploads.has(transferId)) return failure('resource_conflict');

    // 登记必须发生在**第一个 await 之前**。协议规定面板把 `TRANSFER_START` 紧跟在本请求
    // 后面发出、不等 RESPONSE，而 connector 同步派发它；先解析目录再 `set` 的话，
    // `createChunkSink` 每一次都查不到这个 ID——这不是竞态，是必然。
    const directory = (async () => resolveDirectory(await ports.getRootDirectory(), segments, true))();
    temporarySequence += 1;
    uploads.set(transferId, { directory, name, temporaryName: `${TEMPORARY_PREFIX}${temporarySequence}` });

    // 仍然等目录解析完再回应答：路径本身有问题（父目录建不出来等）必须以错误码回给对端，
    // 而不是拖到第一块字节落盘时才以一次传输失败的形式冒出来。抛出交给 `invoke` 的
    // catch 去映射；登记先撤掉，免得这个 ID 挂着一个永远开不了的目录。
    try {
      await directory;
    } catch (error) {
      uploads.delete(transferId);
      throw error;
    }
    return ok({ path: joinLogicalPath([...segments, name]), transferId });
  }

  async function createDirectory(params: Record<string, unknown>): Promise<DevToolsProviderResult> {
    const target = splitLogicalPath(params['path']);
    if (target === undefined) return failure('invalid_path');

    const parent = await resolveDirectory(await ports.getRootDirectory(), target.parent, true);
    // 先探再建：OPFS 的 `create: true` 对已存在的目录是幂等成功，而协议要求冲突可见。
    const existing = await parent.getDirectoryHandle(target.name, { create: false }).catch(() => undefined);
    if (existing !== undefined) return failure('resource_conflict');
    await parent.getDirectoryHandle(target.name, { create: true });
    return ok({ path: joinLogicalPath([...target.parent, target.name]) });
  }

  async function remove(params: Record<string, unknown>): Promise<DevToolsProviderResult> {
    const target = splitLogicalPath(params['path']);
    if (target === undefined) return failure('invalid_path');

    const parent = await resolveDirectory(await ports.getRootDirectory(), target.parent, false);
    await parent.removeEntry(target.name, { recursive: true });
    return ok({ path: params['path'] });
  }

  const handlers: Readonly<Record<string, (params: Record<string, unknown>) => Promise<DevToolsProviderResult>>> = {
    list,
    download,
    upload,
    'create-directory': createDirectory,
    delete: remove
  };

  return {
    descriptor,

    async invoke(operation, params) {
      const handler = Object.hasOwn(handlers, operation) ? handlers[operation] : undefined;
      if (handler === undefined) return failure('provider_unsupported');
      try {
        return await handler(isRecord(params) ? params : {});
      } catch (error) {
        return mapped(error);
      }
    },

    createChunkSink(transferId) {
      const pending = uploads.get(transferId);
      if (pending === undefined) throw new Error(`no registered devtools upload for transfer "${transferId}"`);
      uploads.delete(transferId);
      return createTemporaryFileSink(pending);
    }
  };
}

/**
 * 建一个「先写临时文件、commit 时改名」的 sink。
 *
 * @remarks
 * 写入句柄按需打开：`upload` 应答与第一块字节之间可能隔着任意长的时间，
 * 提前开着 writable 等于提前占住一个目标文件。
 */
function createTemporaryFileSink(pending: PendingUpload): DevToolsChunkSink {
  let writable: FileSystemWritableFileStream | undefined;
  /**
   * 临时产物是否**确实**清理过。
   *
   * @remarks
   * 判据只能是「清理跑完了」，不能是「已经结算了」：`commit` 在搬运临时文件之前就算结算，
   * 搬运抛出时端点会调 `discard` 收口，而以结算为判据的 discard 会掉头就走，把临时文件
   * 永久留在 OPFS 里——每失败一次泄一个，还占着存储配额。
   */
  let cleaned = false;

  const open = async (): Promise<FileSystemWritableFileStream> => {
    if (writable === undefined) {
      const directory = await pending.directory;
      const handle = await directory.getFileHandle(pending.temporaryName, { create: true });
      writable = await handle.createWritable();
    }
    return writable;
  };

  const cleanup = async (): Promise<void> => {
    const directory = await pending.directory;
    await directory.removeEntry(pending.temporaryName, { recursive: false }).catch(() => undefined);
    cleaned = true;
  };

  return {
    async write(data) {
      const stream = await open();
      // 重建一个 `Uint8Array<ArrayBuffer>` 视图：`BufferSource` 不接受 `ArrayBufferLike`
      // 背衬（可能是 SharedArrayBuffer）。这是**视图**不是拷贝，字节没有被复制一份。
      await stream.write(new Uint8Array(data.buffer as ArrayBuffer, data.byteOffset, data.byteLength));
    },

    async commit() {
      const stream = await open();
      await stream.close();
      writable = undefined;
      // OPFS 没有 rename：读回临时文件的句柄再整体写入目标，然后删掉临时文件。
      const directory = await pending.directory;
      const temporary = await directory.getFileHandle(pending.temporaryName, { create: false });
      const target = await directory.getFileHandle(pending.name, { create: true });
      const output = await target.createWritable();
      await output.write(await temporary.getFile());
      await output.close();
      await cleanup();
    },

    async discard() {
      if (cleaned) return;
      await writable?.abort().catch(() => undefined);
      writable = undefined;
      await cleanup();
    }
  };
}
