// @vitest-environment node
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWTVerifyGetKey, type KeyObject } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import type { RetentionStore } from '../../src/gateway/core/retention';
import type { ModelRegistry } from '../../src/gateway/registry/model-registry';
import type { ProviderRegistry } from '../../src/gateway/registry/provider-registry';
import { createGatewayRoutes, type GatewayDeps } from '../../src/routes/gateway';

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

const tokenFor = async (sub: string): Promise<string> =>
  new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(privateKey);

const buildApp = () => {
  const deps: GatewayDeps = {
    providerRegistry: {} as unknown as ProviderRegistry,
    modelRegistry: {} as unknown as ModelRegistry,
    retentionStore: {} as unknown as RetentionStore,
    jwtOptions: { jwksUrl: 'http://unused.local', audience: AUDIENCE, issuer: ISSUER },
    jwksOverride: jwks
  };
  return createGatewayRoutes(deps);
};

const authed = (token: string) => ({ authorization: `Bearer ${token}` });

describe('Notifications routes (US-053)', () => {
  it('无鉴权访问返回 401', async () => {
    const app = buildApp();
    const res = await app.handle(new Request('http://localhost/v1/notifications'));
    expect(res.status).toBe(401);
  });

  it('创建通知后可在列表中读到，未读筛选生效', async () => {
    const app = buildApp();
    const token = await tokenFor('user-ntf-list');

    const createRes = await app.handle(
      new Request('http://localhost/v1/notifications', {
        method: 'POST',
        headers: { ...authed(token), 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'security', title: '密码已修改' })
      })
    );
    expect(createRes.status).toBe(200);
    const created = await createRes.json();
    expect(created.userId).toBe('user-ntf-list');
    expect(created.isRead).toBe(false);

    const listRes = await app.handle(new Request('http://localhost/v1/notifications', { headers: authed(token) }));
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.data.some((n: { id: string }) => n.id === created.id)).toBe(true);

    const unreadRes = await app.handle(
      new Request('http://localhost/v1/notifications?unread=true', { headers: authed(token) })
    );
    const unreadBody = await unreadRes.json();
    expect(unreadBody.data.every((n: { isRead: boolean }) => n.isRead === false)).toBe(true);
  }, 10_000);

  it('标记单条已读后不再出现在未读列表', async () => {
    const app = buildApp();
    const token = await tokenFor('user-ntf-read');

    const createRes = await app.handle(
      new Request('http://localhost/v1/notifications', {
        method: 'POST',
        headers: { ...authed(token), 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'security', title: 'test' })
      })
    );
    const created = await createRes.json();

    const readRes = await app.handle(
      new Request(`http://localhost/v1/notifications/${created.id}/read`, {
        method: 'PATCH',
        headers: authed(token)
      })
    );
    expect(readRes.status).toBe(200);
    const readBody = await readRes.json();
    expect(readBody.isRead).toBe(true);

    const unreadRes = await app.handle(
      new Request('http://localhost/v1/notifications?unread=true', { headers: authed(token) })
    );
    const unreadBody = await unreadRes.json();
    expect(unreadBody.data.some((n: { id: string }) => n.id === created.id)).toBe(false);
  }, 10_000);

  it('全部已读后未读列表为空', async () => {
    const app = buildApp();
    const token = await tokenFor('user-ntf-readall');

    for (const title of ['n1', 'n2']) {
      await app.handle(
        new Request('http://localhost/v1/notifications', {
          method: 'POST',
          headers: { ...authed(token), 'content-type': 'application/json' },
          body: JSON.stringify({ type: 'security', title })
        })
      );
    }

    const readAllRes = await app.handle(
      new Request('http://localhost/v1/notifications/read-all', {
        method: 'PATCH',
        headers: authed(token)
      })
    );
    expect(readAllRes.status).toBe(200);
    const readAllBody = await readAllRes.json();
    expect(readAllBody.updated).toBeGreaterThanOrEqual(2);

    const unreadRes = await app.handle(
      new Request('http://localhost/v1/notifications?unread=true', { headers: authed(token) })
    );
    const unreadBody = await unreadRes.json();
    expect(unreadBody.data.length).toBe(0);
  }, 10_000);

  it('跨用户隔离：无法读取或标记他人通知', async () => {
    const app = buildApp();
    const tokenA = await tokenFor('user-ntf-a');
    const tokenB = await tokenFor('user-ntf-b');

    const createRes = await app.handle(
      new Request('http://localhost/v1/notifications', {
        method: 'POST',
        headers: { ...authed(tokenA), 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'security', title: 'private-to-a' })
      })
    );
    const created = await createRes.json();

    const listAsB = await app.handle(new Request('http://localhost/v1/notifications', { headers: authed(tokenB) }));
    const listBBody = await listAsB.json();
    expect(listBBody.data.some((n: { id: string }) => n.id === created.id)).toBe(false);

    const readAsB = await app.handle(
      new Request(`http://localhost/v1/notifications/${created.id}/read`, {
        method: 'PATCH',
        headers: authed(tokenB)
      })
    );
    expect(readAsB.status).toBe(404);
  }, 10_000);
});
