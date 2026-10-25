import { ImageFormatError, imageMetadata, validateImageBlob } from '../contracts/image-format';
import { imageGenerationRequest, isMiniMaxImageProvider } from '../contracts/image-provider-protocol';
import type { ImageAspectRatio } from '../contracts/index';

export interface LocalProvider {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  mode: 'direct' | 'proxy';
  rememberKey: boolean;
}
export function publicProvider(value: unknown): LocalProvider {
  const p = value as LocalProvider | null;
  if (
    !p ||
    typeof p.id !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(p.id) ||
    typeof p.name !== 'string' ||
    !p.name.trim() ||
    p.name.length > 80 ||
    typeof p.model !== 'string' ||
    !/^[a-zA-Z0-9._:-]{1,128}$/.test(p.model) ||
    !['direct', 'proxy'].includes(p.mode) ||
    typeof p.rememberKey !== 'boolean'
  )
    throw new Error('供应商配置无效，请检查名称、模型和请求通道。');
  return {
    id: p.id,
    name: p.name.trim(),
    model: p.model,
    baseUrl: providerBase(p.baseUrl),
    mode: p.mode,
    rememberKey: p.rememberKey
  };
}
export function providerBase(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('Base URL 需要使用有效的 HTTPS 地址。');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
    throw new Error('Base URL 需要使用 HTTPS，且不能包含账号、查询参数或片段。');
  return url.href.replace(/\/+$/, '');
}
export class ProviderFailure extends Error {
  constructor(
    message: string,
    readonly rejected = false
  ) {
    super(message);
  }
}
export async function bounded(response: Response, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  if (!response.body) throw new ProviderFailure('供应商响应为空，请核对供应商记录。');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) throw new ProviderFailure('供应商响应过大，请核对供应商记录。');
      chunks.push(value);
    }
  } catch (e) {
    await reader.cancel().catch(() => undefined);
    throw e;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ?
      (value as Record<string, unknown>)
    : null;
}
function miniMaxImageResult(envelope: Record<string, unknown> | null): Record<string, unknown> | null {
  const code = object(envelope?.['base_resp'])?.['status_code'];
  if (typeof code !== 'number' || !Number.isSafeInteger(code) || code < 0)
    throw new ProviderFailure('MiniMax 响应状态无效，请核对供应商记录。');
  if (code !== 0)
    throw new ProviderFailure(
      `MiniMax 返回错误码 ${code}。请核对供应商记录。`,
      [1002, 1004, 1008, 1026, 2013, 2049].includes(code)
    );
  const data = object(envelope?.['data']);
  const urls = data?.['image_urls'];
  const base64 = data?.['image_base64'];
  if ((urls !== undefined && !Array.isArray(urls)) || (base64 !== undefined && !Array.isArray(base64))) return null;
  const urlItems: unknown[] = Array.isArray(urls) ? urls : [];
  const base64Items: unknown[] = Array.isArray(base64) ? base64 : [];
  if (urlItems.length + base64Items.length !== 1) return null;
  return { url: urlItems[0], b64_json: base64Items[0] };
}
export async function generateLocalImage(
  provider: LocalProvider,
  key: string,
  prompt: string,
  ratio: ImageAspectRatio,
  signal: AbortSignal
): Promise<Blob> {
  provider = publicProvider(provider);
  const base = providerBase(provider.baseUrl);
  if (!/^[\x21-\x7e]{1,4096}$/.test(key)) throw new ProviderFailure('请先填写有效的 API Key。', true);
  const body = {
    model: provider.model,
    prompt,
    n: 1,
    size:
      ratio === 'landscape' ? '1536x1024'
      : ratio === 'portrait' ? '1024x1536'
      : '1024x1024',
    quality: 'low',
    output_format: 'png'
  };
  const request = imageGenerationRequest(base, body);
  if (!request) throw new ProviderFailure('MiniMax 图片仅支持 image-01，提示词最多 1500 字符。', true);
  const response = await fetch(provider.mode === 'proxy' ? '/api/relay' : request.url, {
    method: 'POST',
    mode: 'cors',
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
    signal,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${key}`,
      ...(provider.mode === 'proxy' ? { 'x-provider-base': base } : {})
    },
    body: JSON.stringify(provider.mode === 'proxy' ? body : request.body)
  });
  if (!response.ok) {
    await response.body?.cancel();
    // Only a definite rejection unlocks a new attempt. 5xx and transport failures remain uncertain.
    throw new ProviderFailure(
      `供应商或代理返回 HTTP ${response.status}。请核对配置和供应商记录。`,
      [400, 401, 403, 404, 413, 422, 429].includes(response.status)
    );
  }
  const data = object(JSON.parse(new TextDecoder().decode(await bounded(response, 24 * 1024 * 1024))));
  if (typeof data?.['error'] === 'string') {
    const code = data['status'];
    const status = typeof code === 'number' && Number.isInteger(code) && code >= 400 && code <= 599 ? code : 502;
    throw new ProviderFailure(`供应商或代理返回 HTTP ${status}。请核对配置和供应商记录。`);
  }
  const items = data?.['data'];
  const item =
    isMiniMaxImageProvider(base) ?
      miniMaxImageResult(data)
    : object(Array.isArray(items) && items.length === 1 ? items[0] : null);
  let bytes: Uint8Array<ArrayBuffer>;
  if (typeof item?.['b64_json'] === 'string') {
    if (
      !item['b64_json'].length ||
      item['b64_json'].length > 23 * 1024 * 1024 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(item['b64_json'])
    )
      throw new ProviderFailure('图片数据无效，请核对供应商结果。');
    bytes = Uint8Array.from(atob(item['b64_json']), c => c.charCodeAt(0));
  } else if (typeof item?.['url'] === 'string') {
    const url = new URL(item['url']);
    if (url.protocol !== 'https:' || url.username || url.password) throw new ProviderFailure('图片地址无效。');
    // No Authorization header is ever forwarded to an image download host.
    const image = await fetch(url, {
      mode: 'cors',
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal
    });
    if (!image.ok) throw new ProviderFailure('图片读取失败，请核对供应商结果。');
    bytes = await bounded(image, 16 * 1024 * 1024);
  } else throw new ProviderFailure('供应商没有返回单张图片，请核对供应商记录。');
  try {
    const { width, height, mimeType } = imageMetadata(bytes);
    if (
      ratio === 'square' ? width !== height
      : ratio === 'landscape' ? width <= height
      : width >= height
    )
      throw new ProviderFailure('图片尺寸不符合选择，结果未保存。');
    const blob = new Blob([bytes], { type: mimeType });
    await validateImageBlob(blob);
    return blob;
  } catch (error) {
    if (error instanceof ImageFormatError) throw new ProviderFailure(error.message);
    throw error;
  }
}
