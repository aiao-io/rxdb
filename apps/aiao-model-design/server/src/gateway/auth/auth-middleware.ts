import type { JWTVerifyGetKey } from 'jose';
import { UnauthorizedError } from '../core/errors';
import type { AuthChannel, AuthIdentity } from '../core/types';
import { verifySupabaseJwt, type JwtVerifierOptions } from './jwt-verifier';

const BEARER_PREFIX = /^Bearer\s+/i;
/**
 * Dashboard BFF 在 `apps/dashboard/src/server/lib/auth-helpers.ts` 中以
 * `cookie.access_token.set(...)` 写入 Supabase access_token，与此处保持一致。
 */
const DEFAULT_COOKIE_NAME = 'access_token';

export interface AuthSource {
  /** Cookie header 原文（包含多个 `key=value` 用 `;` 分隔） */
  cookie?: string;
  /** Authorization header 值（含 `Bearer ` 前缀） */
  authorization?: string;
  /** x-api-key header 值 */
  apiKey?: string;
  /** dashboard / BFF cookie 名（默认 `aiao_jwt`） */
  cookieName?: string;
}

const readCookie = (cookieHeader: string, name: string): string | null => {
  for (const segment of cookieHeader.split(';')) {
    const trimmed = segment.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    if (trimmed.slice(0, eq).trim() === name) {
      return decodeURIComponent(trimmed.slice(eq + 1).trim());
    }
  }
  return null;
};

/**
 * 按 FR-054 优先级 `cookie > authorization > x-api-key` 提取 JWT
 *
 * @returns `{ token, channel }` 命中通道；任一非空且非空白即停下；全空返回 `null`
 */
export function extractJwt(src: AuthSource): { token: string; channel: AuthChannel } | null {
  const cookieName = src.cookieName ?? DEFAULT_COOKIE_NAME;
  if (src.cookie) {
    const value = readCookie(src.cookie, cookieName);
    if (value) return { token: value, channel: 'cookie' };
  }
  if (src.authorization && BEARER_PREFIX.test(src.authorization)) {
    const token = src.authorization.replace(BEARER_PREFIX, '').trim();
    if (token) return { token, channel: 'authorization' };
  }
  if (src.apiKey) {
    const token = src.apiKey.trim();
    if (token) return { token, channel: 'x-api-key' };
  }
  return null;
}

/**
 * 鉴权主入口（FR-054）
 *
 * 1. 按 cookie > authorization > x-api-key 优先级取 JWT
 * 2. 调 `verifySupabaseJwt` 校验签名 / audience / issuer / exp
 * 3. 成功返回 AuthIdentity，失败抛 UnauthorizedError
 *
 * @param jwksOverride 测试覆盖用，注入本地 JWKS
 */
export async function authenticate(
  src: AuthSource,
  opts: JwtVerifierOptions,
  jwksOverride?: JWTVerifyGetKey
): Promise<AuthIdentity> {
  const extracted = extractJwt(src);
  if (!extracted) {
    throw new UnauthorizedError('missing authentication token', 'missing_token');
  }
  const result = await verifySupabaseJwt(extracted.token, opts, jwksOverride);
  return {
    userId: result.userId,
    channel: extracted.channel,
    rawJwt: result.rawJwt,
    expiresAt: result.expiresAt
  };
}
