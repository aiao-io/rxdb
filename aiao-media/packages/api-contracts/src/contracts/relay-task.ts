/** 代理任务令牌所在的请求头；令牌不放进 URL。 */
export const relayTaskTokenHeader = 'x-relay-task-token';

/** 服务端代理任务状态：已发出、已收到结果、明确拒绝、待核对。 */
export type RelayTaskStatus = 'dispatched' | 'received' | 'rejected' | 'needs_review';

/** 查询代理任务时返回的视图，不含令牌、Key 或提示词。 */
export interface RelayTaskView {
  status: RelayTaskStatus;
  /** 上游 HTTP 状态；没有收到上游响应时为 null。 */
  upstreamStatus: number | null;
  updatedAt: string;
}

const encoder = new TextEncoder();
const ivBytes = 12;

/** 判断是否为 32 字节、无填充 base64url 编码的任务令牌。 */
export function isRelayTaskToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}

/** 生成只保存在本机的 32 字节随机任务令牌。 */
export function createRelayTaskToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** 服务端只保存令牌的 SHA-256 十六进制摘要。 */
export async function relayTaskTokenHash(token: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(token)));
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
}

/** 由任务令牌和任务标识派生不可导出的 AES-256-GCM 密钥。 */
export async function relayResultKey(token: string, taskId: string, usage: 'encrypt' | 'decrypt'): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(token), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: encoder.encode(taskId), info: encoder.encode('aiao-relay-result-v1') },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage]
  );
}

/** 加密供应商原始响应，输出为随机 12 字节 IV 与密文。 */
export async function sealRelayResult(
  key: CryptoKey,
  plaintext: Uint8Array<ArrayBuffer>
): Promise<Uint8Array<ArrayBuffer>> {
  const iv = crypto.getRandomValues(new Uint8Array(ivBytes));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext));
  const sealed = new Uint8Array(ivBytes + ciphertext.byteLength);
  sealed.set(iv);
  sealed.set(ciphertext, ivBytes);
  return sealed;
}

/** 用同一任务的令牌解密；令牌或任务不匹配时抛错。 */
export async function openRelayResult(
  key: CryptoKey,
  sealed: Uint8Array<ArrayBuffer>
): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: sealed.subarray(0, ivBytes) }, key, sealed.subarray(ivBytes))
  );
}
