import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWTVerifyGetKey, type KeyObject } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { authenticate, extractJwt } from '../../src/gateway/auth/auth-middleware';
import { UnauthorizedError } from '../../src/gateway/core/errors';

const ISSUER = 'https://test.supabase.co/auth/v1';
const AUDIENCE = 'authenticated';

let privateKey: KeyObject;
let jwks: JWTVerifyGetKey;

beforeAll(async () => {
  const pair = await generateKeyPair('ES256', { extractable: true });
  privateKey = pair.privateKey as KeyObject;
  const jwk = await exportJWK(pair.publicKey as KeyObject);
  jwk.kid = 'test-key';
  jwk.alg = 'ES256';
  jwks = createLocalJWKSet({ keys: [jwk] });
});

const signJwt = async (
  payload: Record<string, unknown>,
  opts: { expiresIn?: string; sub?: string } = {}
): Promise<string> => {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setSubject(opts.sub ?? 'user-123')
    .setExpirationTime(opts.expiresIn ?? '2h')
    .sign(privateKey);
};

describe('extractJwt', () => {
  it('returns null when all sources empty', () => {
    expect(extractJwt({})).toBeNull();
  });

  it('hits cookie channel', () => {
    const r = extractJwt({ cookie: 'access_token=token-a; other=x' });
    expect(r).toEqual({ token: 'token-a', channel: 'cookie' });
  });

  it('hits authorization channel via Bearer prefix', () => {
    const r = extractJwt({ authorization: 'Bearer token-b' });
    expect(r).toEqual({ token: 'token-b', channel: 'authorization' });
  });

  it('ignores authorization without Bearer prefix', () => {
    const r = extractJwt({ authorization: 'Basic abc' });
    expect(r).toBeNull();
  });

  it('hits x-api-key channel', () => {
    const r = extractJwt({ apiKey: 'token-c' });
    expect(r).toEqual({ token: 'token-c', channel: 'x-api-key' });
  });

  it('priority cookie > authorization > x-api-key when all present', () => {
    const r = extractJwt({
      cookie: 'access_token=cookie-token',
      authorization: 'Bearer auth-token',
      apiKey: 'api-token'
    });
    expect(r).toEqual({ token: 'cookie-token', channel: 'cookie' });
  });

  it('falls through to authorization when cookie name missing', () => {
    const r = extractJwt({
      cookie: 'other_cookie=value',
      authorization: 'Bearer auth-token'
    });
    expect(r).toEqual({ token: 'auth-token', channel: 'authorization' });
  });

  it('falls through to x-api-key when cookie + auth missing', () => {
    const r = extractJwt({ cookie: 'noise=x', apiKey: 'k' });
    expect(r).toEqual({ token: 'k', channel: 'x-api-key' });
  });

  it('supports custom cookie name', () => {
    const r = extractJwt({
      cookie: 'sb-access-token=custom',
      cookieName: 'sb-access-token'
    });
    expect(r).toEqual({ token: 'custom', channel: 'cookie' });
  });
});

describe('authenticate', () => {
  const opts = { jwksUrl: 'http://unused.example', audience: AUDIENCE, issuer: ISSUER };

  it('throws when no token present', async () => {
    await expect(authenticate({}, opts, jwks)).rejects.toThrow(UnauthorizedError);
  });

  it('returns AuthIdentity on valid JWT (cookie channel)', async () => {
    const token = await signJwt({}, { sub: 'user-cookie' });
    const id = await authenticate({ cookie: `access_token=${token}` }, opts, jwks);
    expect(id.userId).toBe('user-cookie');
    expect(id.channel).toBe('cookie');
    expect(id.rawJwt).toBe(token);
    expect(id.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('returns AuthIdentity on valid JWT (Bearer)', async () => {
    const token = await signJwt({}, { sub: 'user-bearer' });
    const id = await authenticate({ authorization: `Bearer ${token}` }, opts, jwks);
    expect(id.channel).toBe('authorization');
    expect(id.userId).toBe('user-bearer');
  });

  it('returns AuthIdentity on valid JWT (x-api-key)', async () => {
    const token = await signJwt({}, { sub: 'user-apikey' });
    const id = await authenticate({ apiKey: token }, opts, jwks);
    expect(id.channel).toBe('x-api-key');
  });

  it('throws on expired JWT', async () => {
    const token = await signJwt({}, { expiresIn: '-1s' });
    await expect(authenticate({ apiKey: token }, opts, jwks)).rejects.toThrow(UnauthorizedError);
  });

  it('throws on tampered signature', async () => {
    const token = await signJwt({});
    const tampered = token.slice(0, -2) + 'XX';
    await expect(authenticate({ apiKey: tampered }, opts, jwks)).rejects.toThrow(UnauthorizedError);
  });

  it('throws when audience mismatched', async () => {
    const token = await signJwt({});
    await expect(authenticate({ apiKey: token }, { ...opts, audience: 'wrong-audience' }, jwks)).rejects.toThrow(
      UnauthorizedError
    );
  });

  it('throws when issuer mismatched', async () => {
    const token = await signJwt({});
    await expect(authenticate({ apiKey: token }, { ...opts, issuer: 'wrong-issuer' }, jwks)).rejects.toThrow(
      UnauthorizedError
    );
  });
});
