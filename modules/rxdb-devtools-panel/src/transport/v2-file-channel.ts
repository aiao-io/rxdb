import {
  createDevToolsError,
  type DevToolsChunkSink,
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
 * 攒齐字节再交给浏览器保存的 sink。
 *
 * @remarks
 * # 为什么这一条**没有**做到流式
 *
 * `DevToolsChunkSink` 的形状（`write` 逐块 + 背压）是为「整文件绝不驻留内存」设计的，
 * 而面板这一端做不到：真正的流式落盘只有 `showSaveFilePicker` + `FileSystemWritableFileStream`
 * 一条路，它在这里拿不到——
 *
 * - WebKit（macOS / Linux 的 Tauri webview）根本没有 `showSaveFilePicker`，这条事实已被
 *   `apps/dev-rxdb-tauri-e2e/src/desktop-webview-capability.spec.ts` 的能力表冻结；
 * - 面板在 DevTools 里是一个**跨源 iframe**，File System Access 需要的权限策略在那里给不到。
 *
 * 所以这里如实写成「先攒后存」，并把代价标出来，而不是加一个几乎永远走不到的 picker 分支
 * 假装自己是流式的——那种分支既没人执行，也会让读的人以为内存问题已经解决了。
 *
 * # 代价的边界
 *
 * 峰值内存 ≈ 文件大小，且面板与被检查页共享同一个渲染进程。真正的上界由协商出的
 * `maxTransferBytes` 决定（三方最小值），provider 声明多大这里就可能占多大。
 * 要把它降下来，该动的是 provider 的限额声明，不是这里再加一层缓冲。
 */
function createDownloadSink(fileName: string): DevToolsChunkSink {
  // 元素类型钉成 `Uint8Array<ArrayBuffer>`：`Blob` 的构造签名不收 `SharedArrayBuffer` 背书的视图，
  // 而 sink 契约给的是宽的 `Uint8Array`。下面 `write` 里那次拷贝正是把它收窄到这个类型。
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  return {
    write: async data => {
      // 拷一份而不是存引用：契约只说「调用方不再持有它」，没承诺底层 buffer 不会被复用；
      // 顺带把类型从宽的 `Uint8Array` 收窄成 `Blob` 收得下的那一种。
      chunks.push(new Uint8Array(data));
      return Promise.resolve();
    },
    commit: async () => {
      // 只有走完整条 TRANSFER 状态机才会到这里；任何中途终态走的都是 discard。
      saveBytesThroughAnchor(chunks, fileName);
      chunks.length = 0;
      return Promise.resolve();
    },
    discard: async () => {
      // 幂等：取消、两道超时、写失败与 dispose 都可能触发它。
      chunks.length = 0;
      return Promise.resolve();
    }
  };
}

/**
 * 用一次性 object URL + `<a download>` 把字节交给用户。
 *
 * @remarks
 * `revokeObjectURL` 必须发生在 `click()` **之后**：撤销早于浏览器真正开始读取，
 * 下载会静默变成一个 0 字节文件。放进 `setTimeout(0)` 是让点击先出栈。
 */
function saveBytesThroughAnchor(chunks: readonly Uint8Array<ArrayBuffer>[], fileName: string): void {
  // 复制成可变数组而不是断言：`Blob` 的构造签名要 `BlobPart[]`，而 `Uint8Array` 本身就是合法
  // 的 BlobPart，唯一的不匹配只是 readonly。用 `as` 绕过去会顺带把真正的类型错误一起放行。
  const url = URL.createObjectURL(new Blob([...chunks], { type: 'application/octet-stream' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** 从逻辑路径取末段作为保存文件名；根目录没有末段时用一个确定的占位名。 */
function fileNameOf(path: string): string {
  const segments = path.split('/').filter(segment => segment.length > 0);
  return segments.at(-1) ?? 'download.bin';
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
      const endpoint = resolveEndpoint();
      if (endpoint === null) return offline();
      const sink = createDownloadSink(fileNameOf(path));
      // 走端点的 download（带 sink）而不是普通 `request`：只有前者会驱动 `TRANSFER_*` 状态机
      // 把字节收回来。此前这里是 `call('download', …)`，于是面板只拿到一条成功应答、
      // 一个字节都没收到——用户点了「下载」而什么都没发生，且没有任何报错。
      // `requestId` **必须**穿进 params：provider 的 `download` 用它登记这次传输
      // （`native-files-provider.ts` 的 `downloads.set(requestId, …)`），
      // 之后端点取字节源时只带得了这一个 ID。漏掉它的表征是 provider 回 `invalid_path`，
      // 与「路径真的不对」无法区分——与上面 upload 传 `transferId` 是同一条理由。
      const result = await endpoint.download({ params: requestId => ({ requestId, path }), sink });
      if (result.outcome === 'failed') return { outcome: 'failed', error: result.error };
      // `delivered-at-source` 是成功但**字节没过 wire**（浏览器 OPFS 由页面自己保存）。
      // 并进 `received` 会让这里去保存一个空 sink，正是端点把两者分开的理由。
      return { outcome: 'ok', value: undefined };
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
