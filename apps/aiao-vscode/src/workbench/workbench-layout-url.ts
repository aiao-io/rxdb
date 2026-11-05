import type { SerializedDockview } from 'dockview-core';

/** 地址栏 hash 中承载布局码的参数名，形如 `#layout=<码>`。 */
const LAYOUT_PARAM = 'layout';
/** 布局码长度上限：超出时不写进地址，读到时直接忽略。 */
const MAX_CODE_LENGTH = 65_536;
/** 解压后布局 JSON 的字节上限，挡住压缩炸弹。 */
const MAX_LAYOUT_BYTES = 1 << 20;
/** 字节转二进制串的分块大小，避免展开参数超出调用栈上限。 */
const BINARY_CHUNK = 0x8000;

/** 工作台布局的持久化端口；读出的值不可信，由 Dockview 桥校验后才会应用。 */
export interface WorkbenchLayoutStore {
  /** 读取上次保存的布局；没有时为 null。 */
  load(): Promise<unknown>;
  /** 保存当前布局；高频变化由调用方合并。 */
  save(layout: SerializedDockview): Promise<void>;
}

/** URL 布局存储依赖的宿主：读取当前地址，用 replaceState 原地改写而不新增历史记录。 */
export interface LayoutUrlHost {
  readonly location: { readonly href: string };
  readonly history: Pick<History, 'state' | 'replaceState'>;
}

/** 让字节流过压缩或解压流；输出超过 limit 字节时取消并抛出 RangeError。 */
async function pipeBytes(
  bytes: Uint8Array<ArrayBuffer>,
  stream: CompressionStream | DecompressionStream,
  limit = Number.POSITIVE_INFINITY
): Promise<Uint8Array<ArrayBuffer>> {
  const writer = stream.writable.getWriter();
  // 写端的失败会同样从读端抛出，这里只避免它成为未处理的拒绝
  writer
    .write(bytes)
    .then(() => writer.close())
    .catch(() => undefined);
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (let next = await reader.read(); !next.done; next = await reader.read()) {
    length += next.value.byteLength;
    if (length > limit) {
      await reader.cancel();
      throw new RangeError('布局数据超出上限');
    }
    chunks.push(next.value);
  }
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += BINARY_CHUNK)
    binary += String.fromCharCode(...bytes.subarray(index, index + BINARY_CHUNK));
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64Url(code: string): Uint8Array<ArrayBuffer> {
  const binary = atob(code.replaceAll('-', '+').replaceAll('_', '/'));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

/** 布局 JSON → deflate → 无填充的 base64url，可直接放进地址。 */
export async function encodeLayoutCode(json: string): Promise<string> {
  return toBase64Url(await pipeBytes(new TextEncoder().encode(json), new CompressionStream('deflate')));
}

/** 解开 {@link encodeLayoutCode} 的结果；码非法、数据损坏（zlib 校验失败）或解压后超出上限时返回 null。 */
export async function decodeLayoutCode(code: string): Promise<string | null> {
  if (!code || code.length > MAX_CODE_LENGTH || !/^[\w-]+$/.test(code)) return null;
  try {
    const bytes = await pipeBytes(fromBase64Url(code), new DecompressionStream('deflate'), MAX_LAYOUT_BYTES);
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** 读取地址 hash 参数中的布局码；没有时为 null。 */
export function readLayoutCode(href: string): string | null {
  return new URLSearchParams(new URL(href).hash.slice(1)).get(LAYOUT_PARAM);
}

/** 返回写入布局码（null 表示移除）后的地址，路径、查询与其他 hash 参数保持不变。 */
export function withLayoutCode(href: string, code: string | null): string {
  const url = new URL(href);
  const params = new URLSearchParams(url.hash.slice(1));
  if (code === null) params.delete(LAYOUT_PARAM);
  else params.set(LAYOUT_PARAM, code);
  url.hash = params.toString();
  return url.href;
}

/**
 * 用地址栏 hash 持久化布局：刷新与分享链接都带着布局。
 * 写入走 replaceState，不产生历史记录；按调用顺序串行，被后来者取代的布局直接跳过。
 */
export function createUrlLayoutStore(host: LayoutUrlHost = window): WorkbenchLayoutStore {
  let latest = '';
  let queue: Promise<void> = Promise.resolve();
  return {
    async load() {
      const json = await decodeLayoutCode(readLayoutCode(host.location.href) ?? '');
      if (json === null) return null;
      try {
        return JSON.parse(json) as unknown;
      } catch {
        return null;
      }
    },
    save(layout) {
      const json = JSON.stringify(layout);
      latest = json;
      const task = queue.then(async () => {
        if (json !== latest) return;
        const code = await encodeLayoutCode(json);
        if (json !== latest) return;
        const href = withLayoutCode(host.location.href, code.length > MAX_CODE_LENGTH ? null : code);
        if (href !== host.location.href) host.history.replaceState(host.history.state, '', href);
      });
      queue = task.catch(() => undefined);
      return task;
    }
  };
}
