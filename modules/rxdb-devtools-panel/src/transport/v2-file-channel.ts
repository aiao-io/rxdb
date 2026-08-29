import {
  createDevToolsError,
  type DevToolsPanelEndpoint,
  type DevToolsPanelRequestResult
} from '@aiao/rxdb-devtools';
import type {
  DevToolsFileChannel,
  DevToolsFileEntry,
  DevToolsFileResult,
  DevToolsFileUploadAck
} from './devtools-file-channel';

/**
 * 把 wire 上的 `unknown` 解析成一层目录项。
 *
 * @remarks
 * provider 的 `list` 交出的是**子树**（每个目录项还带着自己的 `entries`），面板一次只渲染一层，
 * 所以这里只取顶层并丢掉嵌套。丢掉不是浪费：子树语义是 OPFS 的历史包袱（见 provider 模块头），
 * 面板不应该把它固化进契约，否则阶段 D 的原生文件后端就必须假装自己也能一次遍历完。
 *
 * 任何一项形状不对即整条判为无效——不做「跳过坏项继续渲染」的容错，那会让一次协议不兼容
 * 表现成「目录里少了几个文件」。
 */
function parseEntries(value: unknown): readonly DevToolsFileEntry[] | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const entries = (value as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) return undefined;

  const parsed: DevToolsFileEntry[] = [];
  for (const entry of entries as readonly unknown[]) {
    const one = parseEntry(entry);
    if (one === undefined) return undefined;
    parsed.push(one);
  }
  return parsed;
}

function parseEntry(value: unknown): DevToolsFileEntry | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const { name, kind, path } = record;
  if (typeof name !== 'string' || typeof path !== 'string') return undefined;
  if (kind === 'directory') return { name, kind, path };
  if (kind !== 'file') return undefined;
  const { size, lastModified } = record;
  if (typeof size !== 'number' || typeof lastModified !== 'number') return undefined;
  return { name, kind, path, size, lastModified };
}

/** 请求结果 → 信道结果；`ok` 分支的载荷交给调用方自己解析。 */
function mapResult<T>(
  result: DevToolsPanelRequestResult,
  parse: (value: unknown) => T | undefined
): DevToolsFileResult<T> {
  if (result.outcome === 'failed') return { outcome: 'failed', error: result.error };
  const value = parse(result.result);
  if (value === undefined) return { outcome: 'failed', error: createDevToolsError('invalid_message') };
  return { outcome: 'ok', value };
}

/** 只关心「成没成」的操作共用这一条。 */
function mapVoid(result: DevToolsPanelRequestResult): DevToolsFileResult<void> {
  if (result.outcome === 'failed') return { outcome: 'failed', error: result.error };
  return { outcome: 'ok', value: undefined };
}

/**
 * 一个按需读取的上传字节源。
 *
 * @remarks
 * 用 `File.slice()` 而不是先 `arrayBuffer()` 整个文件：端点的契约保证一次只要一块，
 * renderer 侧因此全程只驻留一块 chunk。把整个文件读进内存会让 50 MB 的上传在面板里
 * 先占 50 MB，而面板与被检查页共享同一个渲染进程。
 */
function sourceOf(file: File): { totalBytes: number; read(offset: number, length: number): Promise<Uint8Array> } {
  return {
    totalBytes: file.size,
    read: async (offset, length) => new Uint8Array(await file.slice(offset, offset + length).arrayBuffer())
  };
}

/**
 * 解析当前可用的 v2 端点；宿主尚未连上或已断开时返回 `null`。
 *
 * @remarks
 * 是**函数**而不是一个端点实例：端点的寿命比面板短。transport 一断，协商状态就作废，
 * 宿主必须换一个新端点重新协商（见 `negotiation-panel.ts`：v1 facade 是终态，
 * 只有重连才重新协商）。若在装配期把某一个端点实例焊死进信道，重连之后信道会一直
 * 对着一个已经结算完的旧端点说话，而它的每次请求都会以 `session_closed` 结束——
 * 症状是「重连后文件页永久失效」，且看起来像页面侧的问题。
 */
export type DevToolsEndpointResolver = () => DevToolsPanelEndpoint | null;

/** 没有端点可用时的统一终态：这一次调用不成立，且刷新页面/重连才有意义。 */
function offline<T>(): DevToolsFileResult<T> {
  return { outcome: 'failed', error: createDevToolsError('session_closed') };
}

/**
 * 用 v2 数据面客户端实现文件信道。
 *
 * @remarks
 * 这是平台中立的：任何能把 v2 帧收发起来的宿主（Chrome 的四段中继、Electron 的 IPC、
 * Tauri 的定向 transport）拿到 endpoint 就能得到同一套文件能力，不必各写一份 OPFS 状态机。
 *
 * @param resolveEndpoint - 取当前端点；语义见 {@link DevToolsEndpointResolver}。
 * @returns 面板可注入的文件信道。
 */
export function createDevToolsV2FileChannel(resolveEndpoint: DevToolsEndpointResolver): DevToolsFileChannel {
  const call = async (operation: string, params: unknown): Promise<DevToolsPanelRequestResult | null> => {
    const endpoint = resolveEndpoint();
    if (endpoint === null) return null;
    return endpoint.request('files', operation, params);
  };

  return {
    async list(path) {
      const result = await call('list', { path });
      return result === null ? offline() : mapResult(result, parseEntries);
    },

    async download(path) {
      const result = await call('download', { path });
      return result === null ? offline() : mapVoid(result);
    },

    async remove(path) {
      const result = await call('delete', { path });
      return result === null ? offline() : mapVoid(result);
    },

    async createDirectory(path) {
      const result = await call('create-directory', { path });
      return result === null ? offline() : mapVoid(result);
    },

    async upload(path, file): Promise<DevToolsFileResult<DevToolsFileUploadAck>> {
      const endpoint = resolveEndpoint();
      if (endpoint === null) return offline();
      // transferId 由端点铸造并回传：provider 的 `createChunkSink(transferId)` 只拿得到这个 ID，
      // 它认路径的唯一机会就是 upload 请求里的同一个 ID。
      const result = await endpoint.upload({
        params: transferId => ({ transferId, path, name: file.name, size: file.size }),
        source: sourceOf(file)
      });
      if (result.outcome === 'failed') return { outcome: 'failed', error: result.error };
      return { outcome: 'ok', value: 'sent' };
    }
  };
}
