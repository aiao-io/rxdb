/**
 * 连接票据：信令服务建连时为两端各签一张，绑定 `connectionId` 与认证身份。
 *
 * @remarks
 * 会话 hello 里把票据当凭据交给对端，对端用信令服务公布的 Ed25519 公钥验签（US-704 认证合同）。
 * 私钥只在 Worker；验签不依赖服务器在线。格式是 `base64url(声明 JSON).base64url(签名)`，签名覆盖第一段的字节。
 */
import type { P2PPrincipal } from '@aiao/rxdb-plugin-p2p';

/** 票据声明。 */
export interface ConnectionTicketClaims {
  /** 格式版本。 */
  readonly v: 1;
  /** 本次连接的标识。 */
  readonly cid: string;
  /** 认证主体（Supabase `auth.uid()`）。 */
  readonly sub: string;
  /** 设备标识（`p2p.devices.id`）。 */
  readonly dev: string;
  /** 运行实例标识。 */
  readonly ins: string;
  /** 过期时刻（epoch 秒）。 */
  readonly exp: number;
}

const ED25519 = { name: 'Ed25519' } as const;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const toBase64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');

const fromBase64Url = (text: string): Uint8Array<ArrayBuffer> | null => {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
  const binary = atob(text.replaceAll('-', '+').replaceAll('_', '/'));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
};

const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

const isClaims = (value: unknown): value is ConnectionTicketClaims => {
  if (typeof value !== 'object' || value === null) return false;
  const claims = value as Record<string, unknown>;
  return (
    claims['v'] === 1 &&
    isText(claims['cid']) &&
    isText(claims['sub']) &&
    isText(claims['dev']) &&
    isText(claims['ins']) &&
    Number.isSafeInteger(claims['exp'])
  );
};

const parseClaims = (segment: string): ConnectionTicketClaims | null => {
  const bytes = fromBase64Url(segment);
  if (!bytes) return null;
  try {
    const claims: unknown = JSON.parse(decoder.decode(bytes));
    return isClaims(claims) ? claims : null;
  } catch {
    return null;
  }
};

/**
 * 导入签票私钥（Ed25519 JWK，含 `d`）。
 *
 * @remarks
 * 只取 `kty` / `crv` / `x` / `d`：Node 导出的 JWK 带 `alg: "Ed25519"`，workerd 只认 `EdDSA`，原样导入会被拒。
 */
export const importTicketSigningKey = (jwk: JsonWebKey): Promise<CryptoKey> =>
  crypto.subtle.importKey('jwk', { kty: jwk.kty, crv: jwk.crv, x: jwk.x, d: jwk.d }, ED25519, false, ['sign']);

/** 导入验票公钥（Ed25519 JWK，只含 `x`）。 */
export const importTicketVerifyKey = (jwk: JsonWebKey): Promise<CryptoKey> =>
  crypto.subtle.importKey('jwk', { kty: jwk.kty, crv: jwk.crv, x: jwk.x }, ED25519, false, ['verify']);

/** 由私钥 JWK 取出可公开的公钥 JWK。 */
export const publicTicketKeyOf = (jwk: JsonWebKey): JsonWebKey => ({ kty: jwk.kty, crv: jwk.crv, x: jwk.x });

/** 签发票据。 */
export const signConnectionTicket = async (claims: ConnectionTicketClaims, key: CryptoKey): Promise<string> => {
  const body = toBase64Url(encoder.encode(JSON.stringify(claims)));
  const signature = new Uint8Array(await crypto.subtle.sign(ED25519, key, encoder.encode(body)));
  return `${body}.${toBase64Url(signature)}`;
};

/**
 * 校验票据：签名有效、绑定的是这次连接、尚未过期。
 *
 * @param now - 当前时刻（epoch 毫秒）
 * @returns 声明；任何一项不成立都返回 null
 */
export const verifyConnectionTicket = async (
  ticket: string,
  key: CryptoKey,
  expected: { readonly connectionId: string; readonly now: number }
): Promise<ConnectionTicketClaims | null> => {
  const [body, signatureText, ...rest] = ticket.split('.');
  if (!body || !signatureText || rest.length > 0) return null;
  const signature = fromBase64Url(signatureText);
  if (!signature || !(await crypto.subtle.verify(ED25519, key, signature, encoder.encode(body)))) return null;
  const claims = parseClaims(body);
  if (!claims || claims.cid !== expected.connectionId || claims.exp * 1000 <= expected.now) return null;
  return claims;
};

/** 票据声明对应的会话主体。 */
export const ticketPrincipal = (claims: ConnectionTicketClaims): P2PPrincipal => ({
  principal: claims.sub,
  deviceId: claims.dev
});
