import {
  createRemoteJWKSet,
  jwtVerify,
  type CryptoKey,
  type JWK,
  type JWTPayload,
  type JWTVerifyGetKey,
  type KeyObject
} from 'jose';
import { UnauthorizedError } from '../core/errors';

const JWKS_CACHE_MAX_AGE_MS = 10 * 60 * 1000;
const JWKS_COOLDOWN_MS = 30_000;

let cachedJwks: { url: string; jwks: JWTVerifyGetKey } | null = null;

const getRemoteJwksFor = (issuerUrl: string): JWTVerifyGetKey => {
  if (cachedJwks?.url === issuerUrl) return cachedJwks.jwks;
  const jwks = createRemoteJWKSet(new URL(issuerUrl), {
    cacheMaxAge: JWKS_CACHE_MAX_AGE_MS,
    cooldownDuration: JWKS_COOLDOWN_MS
  });
  cachedJwks = { url: issuerUrl, jwks };
  return jwks;
};

/** 测试用：清空模块内 JWKS 缓存 */
export function _resetJwksCache(): void {
  cachedJwks = null;
}

export interface JwtVerifierOptions {
  /**
   * Supabase JWKS 端点 URL
   *
   * 形如 `https://<project>.supabase.co/auth/v1/.well-known/jwks.json`
   * 本地 GoTrue 默认无 JWKS 时留空，改用 `jwtSecret`（仅开发）。
   */
  jwksUrl: string;
  /** JWT audience 校验（Supabase 默认 `authenticated`） */
  audience?: string;
  /** JWT issuer 校验（可选） */
  issuer?: string;
  /**
   * 本地 GoTrue HS256 对称密钥（`GOTRUE_JWT_SECRET`）
   *
   * 仅开发：当 `jwksUrl` 未配置且未注入 `jwksOverride` 时启用。
   * 生产 / 远程 profile 必须走 JWKS，禁止依赖本字段。
   */
  jwtSecret?: string;
}

export interface JwtVerifyResult {
  userId: string;
  rawJwt: string;
  expiresAt: number;
  payload: JWTPayload;
}

/** jose v6 取消了 `KeyLike`：远程 JWKS 走 `JWTVerifyGetKey` 函数，本地对称密钥走字节/密钥对象。 */
type StaticVerifyKey = CryptoKey | KeyObject | JWK | Uint8Array;
type VerifyKey = JWTVerifyGetKey | StaticVerifyKey;

function resolveVerifyKey(opts: JwtVerifierOptions, jwksOverride?: JWTVerifyGetKey): VerifyKey {
  if (jwksOverride) return jwksOverride;
  if (opts.jwksUrl) return getRemoteJwksFor(opts.jwksUrl);
  if (opts.jwtSecret) return new TextEncoder().encode(opts.jwtSecret);
  throw new UnauthorizedError(
    'JWT verifier not configured (set SUPABASE_JWT_ISSUER_URL or SUPABASE_JWT_SECRET for local)',
    'jwks_not_configured'
  );
}

/**
 * 校验 Supabase JWT（FR-054）
 *
 * - 默认使用 jose 远程 JWKS（10 分钟缓存 + 30s cooldown）
 * - 本地栈无 JWKS 时可用 `jwtSecret` HS256（dev-only）
 * - 失败时统一抛 `UnauthorizedError` 携带原因（`jwt_verify_failed` / `jwt_missing_sub` / `jwt_missing_exp`）
 *
 * @param rawJwt 待校验的 JWT 字符串（不含 `Bearer ` 前缀）
 * @param opts JWKS / secret / audience / issuer 配置
 * @param jwksOverride 测试覆盖用（注入本地 JWKS 避免真实 HTTP 请求）
 */
export async function verifySupabaseJwt(
  rawJwt: string,
  opts: JwtVerifierOptions,
  jwksOverride?: JWTVerifyGetKey
): Promise<JwtVerifyResult> {
  try {
    const key = resolveVerifyKey(opts, jwksOverride);
    // 空串等同未配置：本地 GoTrue 用户 token 常无 iss（见 US-516）
    const audience = opts.audience?.trim() || undefined;
    const issuer = opts.issuer?.trim() || undefined;
    // jose 的两个重载互斥（getKey 函数 vs 静态密钥），联合类型必须在调用前收窄
    const { payload } =
      typeof key === 'function' ?
        await jwtVerify(rawJwt, key, { audience, issuer })
      : await jwtVerify(rawJwt, key, { audience, issuer });
    const sub = payload.sub;
    const exp = payload.exp;
    if (!sub) throw new UnauthorizedError('jwt missing sub claim', 'jwt_missing_sub');
    if (!exp) throw new UnauthorizedError('jwt missing exp claim', 'jwt_missing_exp');
    return { userId: sub, rawJwt, expiresAt: exp, payload };
  } catch (cause) {
    if (cause instanceof UnauthorizedError) throw cause;
    const msg = cause instanceof Error ? cause.message : String(cause);
    throw new UnauthorizedError(`jwt verify failed: ${msg}`, 'jwt_verify_failed');
  }
}
