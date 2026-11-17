import { createHmac, generateKeyPairSync, randomUUID, sign as signBytes, type KeyObject } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { CollaborationError } from '../model.js';
import { createIdentities, tokenRulesFromEnv, type AuthLookup, type TokenRules } from './identity.js';

/** 测试令牌：按 JWS 紧凑格式自己签，不依赖任何 JWT 库。 */
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
type Signer = (input: string) => Buffer;
const hs256 =
  (secret: string): Signer =>
  input =>
    createHmac('sha256', secret).update(input).digest();
const es256 =
  (key: KeyObject): Signer =>
  input =>
    signBytes('sha256', Buffer.from(input), { key, dsaEncoding: 'ieee-p1363' });
const rs256 =
  (key: KeyObject): Signer =>
  input =>
    signBytes('sha256', Buffer.from(input), key);
function token(header: Record<string, unknown>, claims: Record<string, unknown>, signer: Signer) {
  const input = `${encode(header)}.${encode(claims)}`;
  return `${input}.${signer(input).toString('base64url')}`;
}
const now = 1_800_000_000_000;
const user = randomUUID();
const claims = (overrides: Record<string, unknown> = {}) => ({
  sub: user,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'member@example.test',
  exp: now / 1000 + 600,
  iat: now / 1000 - 10,
  ...overrides
});
const noAuth: AuthLookup = {
  getUser: vi.fn(async () => {
    throw new Error('steady-state verification must not call Auth');
  })
};
const codeOf = async (work: () => Promise<unknown>) => {
  try {
    await work();
    return 'none';
  } catch (error) {
    return error instanceof CollaborationError ? error.code : `unexpected: ${String(error)}`;
  }
};

describe('部署环境必须显式二选一签名密钥，配置不全时启动即失败', () => {
  it('JWKS 与共享密钥都缺或都给时拒绝启动，不做回退', () => {
    expect(() => tokenRulesFromEnv({})).toThrow(CollaborationError);
    expect(() =>
      tokenRulesFromEnv({ SUPABASE_JWKS_URL: 'https://x.test/auth/v1/.well-known/jwks.json', SUPABASE_JWT_SECRET: 's' })
    ).toThrow(CollaborationError);
    expect(() => tokenRulesFromEnv({ SUPABASE_JWKS_URL: '', SUPABASE_JWT_SECRET: '' })).toThrow(CollaborationError);
  });
  it('JWKS 必须同时配置签发者；共享密钥模式的签发者可选，未配置即要求令牌不带 iss', () => {
    expect(() => tokenRulesFromEnv({ SUPABASE_JWKS_URL: 'https://x.test/jwks' })).toThrow(CollaborationError);
    expect(
      tokenRulesFromEnv({ SUPABASE_JWKS_URL: 'https://x.test/jwks', SUPABASE_JWT_ISSUER: 'https://x.test/auth/v1' })
    ).toEqual({ keys: { kind: 'jwks', url: 'https://x.test/jwks' }, issuer: 'https://x.test/auth/v1' });
    expect(tokenRulesFromEnv({ SUPABASE_JWT_SECRET: 'local-secret' })).toEqual({
      keys: { kind: 'secret', secret: 'local-secret' },
      issuer: undefined
    });
    expect(
      tokenRulesFromEnv({ SUPABASE_JWT_SECRET: 'local-secret', SUPABASE_JWT_ISSUER: 'http://local/auth/v1' })
    ).toEqual({ keys: { kind: 'secret', secret: 'local-secret' }, issuer: 'http://local/auth/v1' });
    expect(() => tokenRulesFromEnv({ SUPABASE_JWKS_URL: 'not a url', SUPABASE_JWT_ISSUER: 'x' })).toThrow(
      CollaborationError
    );
  });
});

describe('HS256 共享密钥（本机隔离栈）的本地验签', () => {
  const secret = 'local-hs256-secret-with-at-least-32-characters';
  const rules: TokenRules = { keys: { kind: 'secret', secret }, issuer: undefined };
  const identities = createIdentities({ rules, auth: noAuth, now: () => now });
  const signed = (overrides: Record<string, unknown> = {}, header: Record<string, unknown> = { alg: 'HS256' }) =>
    token({ typ: 'JWT', ...header }, claims(overrides), hs256(secret));

  it('接受签名、受众、角色与有效期都正确的令牌，身份取自 sub 与 email', async () => {
    await expect(identities.verify(signed())).resolves.toEqual({
      id: user,
      email: 'member@example.test',
      verified: true
    });
    expect(noAuth.getUser).not.toHaveBeenCalled();
  });
  it.each([
    ['已过期', { exp: now / 1000 - 1 }],
    ['尚未生效', { nbf: now / 1000 + 60 }],
    ['缺少有效期', { exp: undefined }],
    ['带了未配置的签发者', { iss: 'https://elsewhere.test/auth/v1' }],
    ['受众不对', { aud: 'anon' }],
    ['匿名角色', { role: 'anon' }],
    ['服务端角色', { role: 'service_role' }],
    ['缺少 sub', { sub: '' }]
  ])('拒绝%s的令牌', async (_label, overrides) => {
    expect(await codeOf(() => identities.verify(signed(overrides)))).toBe('unauthenticated');
  });
  it('拒绝被篡改的载荷、伪造的签名、换成 none 或非对称算法的头部', async () => {
    const [header, , signature] = signed().split('.');
    const forged = `${header}.${encode(claims({ sub: randomUUID() }))}.${signature}`;
    expect(await codeOf(() => identities.verify(forged))).toBe('unauthenticated');
    expect(
      await codeOf(() => identities.verify(token({ alg: 'HS256' }, claims(), hs256('another-secret-entirely'))))
    ).toBe('unauthenticated');
    expect(await codeOf(() => identities.verify(`${encode({ alg: 'none' })}.${encode(claims())}.`))).toBe(
      'unauthenticated'
    );
    expect(await codeOf(() => identities.verify(signed({}, { alg: 'RS256' })))).toBe('unauthenticated');
    expect(await codeOf(() => identities.verify('not-a-token'))).toBe('unauthenticated');
  });
  it('配置了签发者时只接受该签发者签发的令牌', async () => {
    const strict = createIdentities({
      rules: { keys: { kind: 'secret', secret }, issuer: 'http://local/auth/v1' },
      auth: noAuth,
      now: () => now
    });
    await expect(strict.verify(signed({ iss: 'http://local/auth/v1' }))).resolves.toMatchObject({ id: user });
    expect(await codeOf(() => strict.verify(signed()))).toBe('unauthenticated');
    expect(await codeOf(() => strict.verify(signed({ iss: 'http://local/auth/v2' })))).toBe('unauthenticated');
  });
});

describe('非对称签名密钥（JWKS）的本地验签', () => {
  const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const issuer = 'https://project.supabase.test/auth/v1';
  const jwk = (key: KeyObject, kid: string, alg: string) => ({
    ...key.export({ format: 'jwk' }),
    kid,
    alg,
    use: 'sig'
  });
  function jwks(keys: unknown[]) {
    const fetch = vi.fn(
      async () => new Response(JSON.stringify({ keys }), { headers: { 'content-type': 'application/json' } })
    );
    return fetch;
  }
  const rules: TokenRules = { keys: { kind: 'jwks', url: 'https://project.supabase.test/jwks' }, issuer };
  const signedBy = (signer: Signer, header: Record<string, unknown>, overrides: Record<string, unknown> = {}) =>
    token({ typ: 'JWT', ...header }, claims({ iss: issuer, ...overrides }), signer);

  it('用 JWKS 里按 kid 找到的 ES256 与 RS256 公钥验签，公钥只取一次并缓存', async () => {
    const fetch = jwks([jwk(ec.publicKey, 'ec-1', 'ES256'), jwk(rsa.publicKey, 'rsa-1', 'RS256')]);
    const identities = createIdentities({ rules, auth: noAuth, now: () => now, fetch });
    await expect(identities.verify(signedBy(es256(ec.privateKey), { alg: 'ES256', kid: 'ec-1' }))).resolves.toEqual({
      id: user,
      email: 'member@example.test',
      verified: true
    });
    await expect(
      identities.verify(signedBy(rs256(rsa.privateKey), { alg: 'RS256', kid: 'rsa-1' }))
    ).resolves.toMatchObject({ id: user });
    for (let i = 0; i < 5; i++) await identities.verify(signedBy(es256(ec.privateKey), { alg: 'ES256', kid: 'ec-1' }));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(noAuth.getUser).not.toHaveBeenCalled();
  });
  it.each([
    ['已过期', { exp: now / 1000 - 1 }],
    ['签发者不对', { iss: 'https://other.supabase.test/auth/v1' }],
    ['缺少签发者', { iss: undefined }],
    ['受众不对', { aud: ['anon'] }],
    ['角色不对', { role: 'service_role' }]
  ])('拒绝%s的令牌', async (_label, overrides) => {
    const identities = createIdentities({
      rules,
      auth: noAuth,
      now: () => now,
      fetch: jwks([jwk(ec.publicKey, 'ec-1', 'ES256')])
    });
    expect(
      await codeOf(() => identities.verify(signedBy(es256(ec.privateKey), { alg: 'ES256', kid: 'ec-1' }, overrides)))
    ).toBe('unauthenticated');
  });
  it('拒绝篡改、换算法（含拿公钥当 HS256 密钥）与密钥不匹配的令牌', async () => {
    const identities = createIdentities({
      rules,
      auth: noAuth,
      now: () => now,
      fetch: jwks([jwk(ec.publicKey, 'ec-1', 'ES256'), jwk(rsa.publicKey, 'rsa-1', 'RS256')])
    });
    const good = signedBy(es256(ec.privateKey), { alg: 'ES256', kid: 'ec-1' });
    const [header, , signature] = good.split('.');
    const forged = `${header}.${encode(claims({ iss: issuer, role: 'authenticated', sub: randomUUID() }))}.${signature}`;
    expect(await codeOf(() => identities.verify(forged))).toBe('unauthenticated');
    const publicPem = ec.publicKey.export({ format: 'pem', type: 'spki' }).toString();
    expect(await codeOf(() => identities.verify(signedBy(hs256(publicPem), { alg: 'HS256', kid: 'ec-1' })))).toBe(
      'unauthenticated'
    );
    expect(await codeOf(() => identities.verify(signedBy(rs256(rsa.privateKey), { alg: 'RS256', kid: 'ec-1' })))).toBe(
      'unauthenticated'
    );
    const other = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    expect(
      await codeOf(() => identities.verify(signedBy(es256(other.privateKey), { alg: 'ES256', kid: 'ec-1' })))
    ).toBe('unauthenticated');
  });
  it('遇到未知 kid 时重新取 JWKS（轮换密钥），仍找不到则拒绝；30 秒内不因未知 kid 反复重取', async () => {
    const rotated = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    let published = [jwk(ec.publicKey, 'ec-1', 'ES256')];
    const fetch = vi.fn(async () => new Response(JSON.stringify({ keys: published })));
    let clock = now;
    const identities = createIdentities({ rules, auth: noAuth, now: () => clock, fetch });
    await identities.verify(signedBy(es256(ec.privateKey), { alg: 'ES256', kid: 'ec-1' }));
    published = [...published, jwk(rotated.publicKey, 'ec-2', 'ES256')];
    const rotatedToken = () => signedBy(es256(rotated.privateKey), { alg: 'ES256', kid: 'ec-2' });
    // 刚取过 JWKS：伪造的 kid 不能让每个请求都去取一次
    expect(await codeOf(() => identities.verify(rotatedToken()))).toBe('unauthenticated');
    expect(fetch).toHaveBeenCalledTimes(1);
    clock += 31_000;
    await expect(identities.verify(rotatedToken())).resolves.toMatchObject({ id: user });
    expect(fetch).toHaveBeenCalledTimes(2);
    for (let i = 0; i < 3; i++)
      expect(
        await codeOf(() => identities.verify(signedBy(es256(rotated.privateKey), { alg: 'ES256', kid: 'unknown' })))
      ).toBe('unauthenticated');
    expect(fetch).toHaveBeenCalledTimes(2);
    clock += 31_000;
    expect(
      await codeOf(() => identities.verify(signedBy(es256(rotated.privateKey), { alg: 'ES256', kid: 'unknown' })))
    ).toBe('unauthenticated');
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('取 JWKS 失败按服务暂不可用处理，不放行也不改用别的校验方式', async () => {
    const fetch = vi.fn(async () => new Response('unavailable', { status: 503 }));
    const identities = createIdentities({ rules, auth: noAuth, now: () => now, fetch });
    await expect(identities.verify(signedBy(es256(ec.privateKey), { alg: 'ES256', kid: 'ec-1' }))).rejects.toThrow();
    expect(noAuth.getUser).not.toHaveBeenCalled();
  });
});

describe('接受邀请时才向 Auth 确认邮箱', () => {
  const secret = 'local-hs256-secret-with-at-least-32-characters';
  const rules: TokenRules = { keys: { kind: 'secret', secret }, issuer: undefined };
  const access = token({ alg: 'HS256' }, claims({ email: 'stale@example.test' }), hs256(secret));
  const authWith = (value: Awaited<ReturnType<AuthLookup['getUser']>>): AuthLookup => ({
    getUser: vi.fn(async () => value)
  });

  it('以 Auth 返回的已验证邮箱为准，每次确认访问 Auth 一次', async () => {
    const auth = authWith({
      data: { user: { id: user, email: 'Member@Example.test', email_confirmed_at: '2026-11-17T00:00:00Z' } },
      error: null
    });
    const identities = createIdentities({ rules, auth, now: () => now });
    const local = await identities.verify(access);
    await expect(identities.confirm(access, local)).resolves.toEqual({
      id: user,
      email: 'Member@Example.test',
      verified: true
    });
    expect(auth.getUser).toHaveBeenCalledTimes(1);
    expect(auth.getUser).toHaveBeenCalledWith(access);
  });
  it.each([
    [
      '邮箱尚未验证',
      { data: { user: { id: user, email: 'member@example.test', email_confirmed_at: null } }, error: null }
    ],
    ['账号已删除或会话失效', { data: { user: null }, error: new Error('user not found') }],
    [
      '令牌与 Auth 的账号不一致',
      { data: { user: { id: randomUUID(), email: 'member@example.test', email_confirmed_at: 'x' } }, error: null }
    ]
  ])('%s时拒绝', async (_label, value) => {
    const identities = createIdentities({ rules, auth: authWith(value as never), now: () => now });
    const local = await identities.verify(access);
    expect(await codeOf(() => identities.confirm(access, local))).toBe('unauthenticated');
  });
});
