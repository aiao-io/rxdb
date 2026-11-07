// @vitest-environment node
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWTVerifyGetKey, type KeyObject } from 'jose';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/bootstrap';
import { MockEchoProvider } from '../../src/gateway/providers/mock-echo.provider';
import type { ProviderFactory } from '../../src/gateway/registry/provider-registry';

const ISSUER = 'https://test.supabase.co/auth/v1';
const AUDIENCE = 'authenticated';

let token: string;
let jwks: JWTVerifyGetKey;

beforeAll(async () => {
  const pair = await generateKeyPair('ES256', { extractable: true });
  const privateKey = pair.privateKey as KeyObject;
  const jwk = await exportJWK(pair.publicKey as KeyObject);
  jwk.kid = 'test-key';
  jwk.alg = 'ES256';
  jwks = createLocalJWKSet({ keys: [jwk] });

  token = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject('user-default-swap')
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(privateKey);

  process.env.SUPABASE_JWT_AUDIENCE = AUDIENCE;
  process.env.SUPABASE_JWT_ISSUER = ISSUER;
});

const buildAppWithDefault = async (defaultId: 'echo-a' | 'echo-b') => {
  const tmp = mkdtempSync(join(tmpdir(), 'default-swap-'));
  const yamlPath = join(tmp, 'providers.yaml');
  writeFileSync(
    yamlPath,
    [
      'providers:',
      '  - id: echo-a',
      '    modality: chat',
      '    modelIds: [echo-a-model]',
      "    baseUrl: 'internal://a'",
      "    apiKey: ''",
      '    capabilities: [stream]',
      `    isDefault: ${defaultId === 'echo-a'}`,
      '  - id: echo-b',
      '    modality: chat',
      '    modelIds: [echo-b-model]',
      "    baseUrl: 'internal://b'",
      "    apiKey: ''",
      '    capabilities: [stream]',
      `    isDefault: ${defaultId === 'echo-b'}`
    ].join('\n')
  );

  const factories: ProviderFactory[] = [
    {
      id: 'echo-a',
      modality: 'chat',
      build: c =>
        new MockEchoProvider({
          modelIds: c.modelIds,
          capabilities: c.capabilities
        })
    },
    {
      id: 'echo-b',
      modality: 'chat',
      build: c =>
        new MockEchoProvider({
          modelIds: c.modelIds,
          capabilities: c.capabilities
        })
    }
  ];

  const retentionDir = mkdtempSync(join(tmpdir(), 'aiao-gw-retent-'));
  return createApp({
    factories,
    jwksUrl: 'http://unused.local',
    jwksOverride: jwks,
    providersConfigPath: yamlPath,
    retentionRootDir: retentionDir
  });
};

/** AI SDK data stream → joined text */
const collectDataStream = (raw: string): string => {
  const chars: string[] = [];
  for (const line of raw.split('\n')) {
    if (!line.startsWith('0:')) continue;
    try {
      chars.push(JSON.parse(line.slice(2)) as string);
    } catch {
      // ignore
    }
  }
  return chars.join('');
};

/**
 * FR-003 + FR-052：default chat provider 可以通过修改 providers.yaml 的 isDefault
 * 字段切换；项目兼容路径 `/api/ai/model/chat` 在请求无 model 字段时使用 default。
 *
 * 验收 US4：切换 default 后，dashboard /api/ai/model/chat 路由的实际命中 provider 改变，
 * 无需修改调用方代码。
 */
describe('Default provider swap (US4 / T088)', () => {
  it('default=echo-a → /api/ai/model/chat 命中 echo-a', async () => {
    const app = await buildAppWithDefault('echo-a');
    const res = await app.handle(
      new Request('http://localhost/api/ai/model/chat', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'swap-test-a' }]
        })
      })
    );
    expect(res.status).toBe(200);
    const joined = collectDataStream(await res.text());
    expect(joined).toBe('swap-test-a');
  });

  it('default=echo-b → 同一调用方代码命中 echo-b（零改动）', async () => {
    const app = await buildAppWithDefault('echo-b');
    const res = await app.handle(
      new Request('http://localhost/api/ai/model/chat', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'swap-test-b' }]
        })
      })
    );
    expect(res.status).toBe(200);
    const joined = collectDataStream(await res.text());
    expect(joined).toBe('swap-test-b');
  });
});
