import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { verifySupabaseJwt } from '../../src/gateway/auth/jwt-verifier';
import { UnauthorizedError } from '../../src/gateway/core/errors';

const SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long';
const ISSUER = 'http://127.0.0.1:54321/auth/v1';
const AUDIENCE = 'authenticated';

async function signLocalUserToken(overrides: Record<string, unknown> = {}): Promise<string> {
  return new SignJWT({
    role: 'authenticated',
    email: 'dev@example.com',
    ...overrides
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject('20e9525e-e5d0-4dcb-b766-0d7ebf61554e')
    .setIssuedAt()
    .setExpirationTime('1h')
    .setAudience(AUDIENCE)
    .setIssuer(ISSUER)
    .sign(new TextEncoder().encode(SECRET));
}

describe('verifySupabaseJwt HS256 (local GoTrue)', () => {
  it('verifies access token with jwtSecret when jwksUrl empty', async () => {
    const token = await signLocalUserToken();
    const result = await verifySupabaseJwt(token, {
      jwksUrl: '',
      jwtSecret: SECRET,
      audience: AUDIENCE,
      issuer: ISSUER
    });
    expect(result.userId).toBe('20e9525e-e5d0-4dcb-b766-0d7ebf61554e');
    expect(result.payload.role).toBe('authenticated');
  });

  it('rejects remote-shaped issuer with local secret', async () => {
    const token = await new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject('remote-user')
      .setIssuedAt()
      .setExpirationTime('1h')
      .setAudience(AUDIENCE)
      .setIssuer('https://example.supabase.co/auth/v1')
      .sign(new TextEncoder().encode(SECRET));

    await expect(
      verifySupabaseJwt(token, {
        jwksUrl: '',
        jwtSecret: SECRET,
        audience: AUDIENCE,
        issuer: ISSUER
      })
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('fails closed when neither jwks nor secret configured', async () => {
    const token = await signLocalUserToken();
    await expect(
      verifySupabaseJwt(token, {
        jwksUrl: '',
        audience: AUDIENCE,
        issuer: ISSUER
      })
    ).rejects.toMatchObject({ code: 'jwks_not_configured' });
  });

  it('accepts HS256 token without iss when issuer env is empty string', async () => {
    const token = await new SignJWT({ role: 'authenticated', email: 'dev@example.com' })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject('20e9525e-e5d0-4dcb-b766-0d7ebf61554e')
      .setIssuedAt()
      .setExpirationTime('1h')
      .setAudience(AUDIENCE)
      .sign(new TextEncoder().encode(SECRET));

    const result = await verifySupabaseJwt(token, {
      jwksUrl: '',
      jwtSecret: SECRET,
      audience: AUDIENCE,
      issuer: ''
    });
    expect(result.userId).toBe('20e9525e-e5d0-4dcb-b766-0d7ebf61554e');
  });
});
