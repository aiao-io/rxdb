import { beforeEach, describe, expect, it, vi } from 'vitest';

const createRemoteJWKSet = vi.fn(() => vi.fn(() => Promise.reject(new Error('jwks fetch blocked in unit test'))));

vi.mock('jose', async importOriginal => {
  const actual = await importOriginal<typeof import('jose')>();
  return { ...actual, createRemoteJWKSet };
});

const { _resetJwksCache, verifySupabaseJwt } = await import('../../src/gateway/auth/jwt-verifier');

const JWKS_URL = 'https://project-a.supabase.co/auth/v1/.well-known/jwks.json';
const OTHER_JWKS_URL = 'https://project-b.supabase.co/auth/v1/.well-known/jwks.json';

/** 头部合法但签名无效：jose 会走到 getKey，足以观察 JWKS 实例是否被复用 */
const UNVERIFIABLE_TOKEN = [
  Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'k1' })).toString('base64url'),
  Buffer.from(JSON.stringify({ sub: 'u1', exp: 4102444800 })).toString('base64url'),
  'not-a-real-signature'
].join('.');

const verify = (jwksUrl: string) => verifySupabaseJwt(UNVERIFIABLE_TOKEN, { jwksUrl }).catch(() => undefined);

describe('verifySupabaseJwt 远程 JWKS 缓存', () => {
  beforeEach(() => {
    _resetJwksCache();
    createRemoteJWKSet.mockClear();
  });

  it('同一 issuer URL 只创建一次 JWKS 实例', async () => {
    await verify(JWKS_URL);
    await verify(JWKS_URL);

    expect(createRemoteJWKSet).toHaveBeenCalledTimes(1);
  });

  it('换 issuer URL 会重新创建 JWKS 实例', async () => {
    await verify(JWKS_URL);
    await verify(OTHER_JWKS_URL);

    expect(createRemoteJWKSet).toHaveBeenCalledTimes(2);
  });

  it('_resetJwksCache 后重新创建 JWKS 实例', async () => {
    await verify(JWKS_URL);
    _resetJwksCache();
    await verify(JWKS_URL);

    expect(createRemoteJWKSet).toHaveBeenCalledTimes(2);
  });
});
