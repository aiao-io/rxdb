/**
 * 运行时无关的编码工具：只用 `atob`、`TextEncoder` / `TextDecoder` 与 `crypto.subtle`，
 * 命令入口的 Node 进程与 Supabase Edge Function（Deno）跑同一份代码，不依赖 `Buffer` 或 `node:crypto`。
 */
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** 文本的 UTF-8 字节。 */
export function utf8(text: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(text);
}

/** UTF-8 字节解码为文本；非法序列按替换字符处理（与 `Buffer#toString('utf8')` 一致）。 */
export function fromUtf8(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

/** base64url（有无填充均可）解码为字节；含非法字符或长度不合法时抛出。 */
export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const base64 = text.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '='));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

/** 字节的标准 base64（带填充）编码。 */
export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** base64url 编码的 JSON 值（JWT 的头部与载荷）；编码或 JSON 不合法时抛出。 */
export function base64UrlJson(text: string): unknown {
  return JSON.parse(fromUtf8(fromBase64Url(text)));
}

/** 文本 UTF-8 字节的 SHA-256 摘要，64 位十六进制小写。 */
export async function sha256Hex(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(text)));
  return [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
