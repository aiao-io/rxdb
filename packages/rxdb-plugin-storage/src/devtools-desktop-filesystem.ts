/**
 * @fileoverview DevTools 原生文件 provider 的桌面宿主文件系统（US-904 阶段 D / US-905）。
 *
 * @remarks
 * 这是 {@link @aiao/rxdb-devtools!DevToolsNativeFilesystem} 接口在桌面 host 上的实现：
 * 把「已校验的逻辑段序列」翻译成 `@aiao/rxdb-adapter-sqlite-core/desktop-host` 的 `file.*`
 * 请求，同时负责字节按需搬运（`file.read` 分帧拉取、`file.writeBegin/Chunk/Commit/Abort`
 * 分帧落盘），绝不让整份文件驻留在 renderer 堆上。
 *
 * 与 `desktop.ts` 的 {@link @aiao/rxdb-plugin-storage!createDesktopStorageFilesystem}
 * **各自独立**：那个实现的是 `StorageFilesystem`（按 `RxdbFileStorage` 的调用点反推，带锁后端、
 * Blob 整读），这个实现的是 devtools provider 要的更薄的 `DevToolsNativeFilesystem`
 * （段序列、目录项带大小与时间、offset 按需读）。两者共用同一套物理名编码与同一条 host 传输，
 * 因此看到的是同一批文件。
 *
 * @module rxdb-plugin-storage/devtools-desktop
 */

import {
  DESKTOP_HOST_MAX_FILE_CHUNK_BYTES,
  resolveDesktopHostTransport,
  type DesktopHostFileRequest,
  type DesktopHostFileResponse,
  type DesktopHostTransport,
  type RxDBAdapterDesktopErrorCode
} from '@aiao/rxdb-adapter-sqlite-core/desktop-host';
import type {
  DevToolsChunkSink,
  DevToolsChunkSource,
  DevToolsNativeEntry,
  DevToolsNativeFilesystem
} from '@aiao/rxdb-devtools';
import { decodePhysicalName, encodePhysicalName } from './filesystem/physical-name.js';

/**
 * 桌面 host 错误码 → Node errno。
 *
 * @remarks
 * devtools provider 的错误映射只认 Node errno（`mapPlatformError('node', …)` 读 `error.code`
 * 查 `NODE_ERROR_CODES`），而 host 回的是它自己的 `RxDBAdapterDesktopErrorCode`。这里把两者
 * 接起来：映射到 errno 之后，provider 再把它翻成共享 provider 码（`file_not_found` →
 * `ENOENT` → `resource_not_found`）。没有对应 errno 的码如实落进 `operation_failed`，不强凑。
 */
const DESKTOP_FILE_ERROR_TO_NODE_ERRNO: Readonly<Partial<Record<RxDBAdapterDesktopErrorCode, string>>> = {
  file_not_found: 'ENOENT',
  permission_denied: 'EACCES',
  invalid_file_path: 'EINVAL',
  disk_full: 'ENOSPC',
  session_closed: 'ENODEV'
};

/** 把 host 报错的应答翻成带 Node errno 的异常，交给 provider 的共享映射继续翻。 */
const toNodeError = (code: RxDBAdapterDesktopErrorCode, message: string): Error => {
  const errno = DESKTOP_FILE_ERROR_TO_NODE_ERRNO[code];
  if (errno === undefined) return new Error(message);
  return Object.assign(new Error(message), { code: errno });
};

/** {@link createDevToolsDesktopFilesystem} 的入参。 */
export interface DevToolsDesktopFilesystemOptions {
  /** 插件专用逻辑根，与 `rxDBPluginStorage` 的 `rootDir` 同值；空段序列映射到它。 */
  readonly rootDir: string;
  /**
   * 与 host 通信的传输层；省略时读 preload 注入的全局桥接。
   *
   * @remarks
   * 显式传入只用于测试：生产路径必须走 preload 暴露的那一个对象，否则 renderer 自带一条
   * 不受 `contextBridge` 约束的通道。
   */
  readonly transport?: DesktopHostTransport;
}

/** 可释放会话的 `DevToolsNativeFilesystem`；`dispose` 不是接口成员，供装配层回收 host 会话。 */
export type DevToolsDesktopFilesystem = DevToolsNativeFilesystem & { dispose(): void };

type FileResponseOf<K extends DesktopHostFileResponse['kind']> = Extract<DesktopHostFileResponse, { kind: K }>;

/**
 * 建一个桌面宿主文件系统，供 {@link @aiao/rxdb-devtools!createDevToolsNativeFilesProvider} 装配。
 *
 * @param options - 逻辑根与传输层
 * @returns 段序列接口的文件系统，外加一个 `dispose` 回收会话
 */
export function createDevToolsDesktopFilesystem(options: DevToolsDesktopFilesystemOptions): DevToolsDesktopFilesystem {
  const transport = options.transport ?? resolveDesktopHostTransport();
  /** 已建立的 host 会话；惰性开启，`dispose()` 后置空，下次使用时重开。 */
  let sessionPromise: Promise<string> | null = null;

  /** 发送一条 `file.*` 请求并校验应答种类；错误应答还原成本地异常。 */
  const send = async <K extends DesktopHostFileRequest['kind']>(
    payload: DesktopHostFileRequest & { kind: K }
  ): Promise<FileResponseOf<K>> => {
    const response = (await transport.request(payload)) as DesktopHostFileResponse;
    if (response.kind === 'error') throw toNodeError(response.code, response.message);
    if (response.kind !== payload.kind) {
      throw new Error(`desktop host answered ${response.kind} to a ${payload.kind} request`);
    }
    return response as FileResponseOf<K>;
  };

  const session = (): Promise<string> => (sessionPromise ??= openSession());

  async function openSession(): Promise<string> {
    const { result } = await send({ kind: 'file.open' });
    return result.sessionId;
  }

  /** 把「逻辑根 + 段序列」转成相对存储根的物理路径；空段序列映射到根自身。 */
  const toPhysicalPath = (segments: readonly string[]): string =>
    [options.rootDir, ...segments].flatMap(segment => segment.split('/')).filter(Boolean).map(encodePhysicalName).join('/');

  async function stat(segments: readonly string[]): Promise<DevToolsNativeEntry | undefined> {
    const { result } = await send({ kind: 'file.stat', sessionId: await session(), path: toPhysicalPath(segments) });
    if (result === null) return undefined;
    return {
      name: segments.at(-1) ?? '',
      kind: result.kind,
      size: result.size,
      lastModified: result.lastModified
    };
  }

  async function list(segments: readonly string[]): Promise<readonly DevToolsNativeEntry[]> {
    const sessionId = await session();
    const { result } = await send({ kind: 'file.list', sessionId, path: toPhysicalPath(segments) });
    // `file.list` 只回名称与类型；大小与时间要对每条再 stat 一次。list 只返一层，N+1 有界。
    return await Promise.all(
      result.map(async entry => {
        const name = decodePhysicalName(entry.name);
        const detail = await stat([...segments, name]);
        return { name, kind: entry.kind, size: detail?.size ?? 0, lastModified: detail?.lastModified ?? 0 };
      })
    );
  }

  async function createDirectory(segments: readonly string[]): Promise<void> {
    await send({ kind: 'file.mkdir', sessionId: await session(), path: toPhysicalPath(segments) });
  }

  async function remove(segments: readonly string[]): Promise<void> {
    const entry = await stat(segments);
    if (entry === undefined) throw toNodeError('file_not_found', 'missing');
    const sessionId = await session();
    await send({
      kind: entry.kind === 'directory' ? 'file.rmdir' : 'file.remove',
      sessionId,
      path: toPhysicalPath(segments)
    });
  }

  async function openRead(segments: readonly string[]): Promise<DevToolsChunkSource> {
    const sessionId = await session();
    const { result } = await send({ kind: 'file.stat', sessionId, path: toPhysicalPath(segments) });
    if (result === null || result.kind !== 'file') throw toNodeError('file_not_found', 'not a file');
    const totalBytes = result.size;

    return {
      totalBytes,
      async read(offset, length) {
        // 状态机保证 `offset + length ≤ totalBytes`，故 host 不会在正常路径上短读。
        const frame = await send({
          kind: 'file.read',
          sessionId,
          path: toPhysicalPath(segments),
          offset,
          length: Math.min(length, DESKTOP_HOST_MAX_FILE_CHUNK_BYTES)
        });
        return frame.result.chunk;
      },
      // `file.read` 按 offset 拉取，无句柄可释放；close 是接口要求的空操作。
      async close(): Promise<void> {
        return;
      }
    };
  }

  async function openWrite(segments: readonly string[]): Promise<DevToolsChunkSink> {
    const sessionId = await session();
    const { result } = await send({ kind: 'file.writeBegin', sessionId, path: toPhysicalPath(segments) });
    const writeId = result.writeId;

    return {
      async write(data) {
        // 来源是 transfer 状态机的 base64 解码产物，恒为普通 ArrayBuffer 视图，不是 SharedArrayBuffer。
        await send({ kind: 'file.writeChunk', sessionId, writeId, chunk: data as Uint8Array<ArrayBuffer> });
      },
      async commit() {
        await send({ kind: 'file.writeCommit', sessionId, writeId });
      },
      async discard() {
        // 已在错误路径上：abort 再失败会盖住真正要修的原因，静默丢弃即可。
        try {
          await send({ kind: 'file.writeAbort', sessionId, writeId });
        } catch {
          return;
        }
      }
    };
  }

  function dispose(): void {
    const pending = sessionPromise;
    sessionPromise = null;
    if (pending === null) return;
    void pending.then(sessionId => send({ kind: 'file.close', sessionId }).catch(() => undefined));
  }

  return { list, stat, createDirectory, remove, openRead, openWrite, dispose };
}
