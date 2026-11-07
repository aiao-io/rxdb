// @vitest-environment node
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWTVerifyGetKey, type KeyObject } from 'jose';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/bootstrap';
import { MockEchoProvider } from '../../src/gateway/providers/mock-echo.provider';
import type { ChatProvider } from '../../src/gateway/providers/types';
import type { ProviderFactory } from '../../src/gateway/registry/provider-registry';

const ISSUER = 'https://test.supabase.co/auth/v1';
const AUDIENCE = 'authenticated';

let token: string;
let jwks: JWTVerifyGetKey;

class AlwaysSkippedProvider implements ChatProvider {
  readonly id = 'always-skip';
  readonly modality = 'chat' as const;
  readonly modelIds = ['skip-model'];
  readonly capabilities = ['stream'] as const;

  async healthCheck(): Promise<void> {
    throw new Error('provider is intentionally unreachable');
  }
  async complete(): Promise<never> {
    throw new Error('should never be called');
  }
  // eslint-disable-next-line require-yield
  async *stream(): AsyncIterable<never> {
    throw new Error('should never be called');
  }
}

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
    .setSubject('user-skip-test')
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(privateKey);

  process.env.SUPABASE_JWT_AUDIENCE = AUDIENCE;
  process.env.SUPABASE_JWT_ISSUER = ISSUER;
});

const buildAppWithSkippedProvider = async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'skipped-'));
  const yamlPath = join(tmp, 'providers.yaml');
  writeFileSync(
    yamlPath,
    [
      'providers:',
      '  - id: alive',
      '    modality: chat',
      '    modelIds: [alive-model]',
      "    baseUrl: 'internal://alive'",
      "    apiKey: ''",
      '    capabilities: [stream]',
      '    isDefault: true',
      '  - id: always-skip',
      '    modality: chat',
      '    modelIds: [skip-model]',
      "    baseUrl: 'internal://skip'",
      "    apiKey: ''",
      '    capabilities: [stream]'
    ].join('\n')
  );

  const factories: ProviderFactory[] = [
    {
      id: 'alive',
      modality: 'chat',
      build: c => new MockEchoProvider({ modelIds: c.modelIds, capabilities: c.capabilities })
    },
    {
      id: 'always-skip',
      modality: 'chat',
      build: () => new AlwaysSkippedProvider()
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

/**
 * FR-004 + FR-056：health check 失败的 provider 被标记 skipped；它的 model id
 * 不会进入 ModelRegistry，因此 /v1/models discover 看不到，直接调用其 model id 应返回 404。
 */
describe('Skipped provider not discoverable (US4 / T089)', () => {
  it('skipped provider model id absent from GET /v1/models', async () => {
    const app = await buildAppWithSkippedProvider();
    const res = await app.handle(
      new Request('http://localhost/v1/models', {
        method: 'GET',
        headers: { authorization: `Bearer ${token}` }
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{ id: string }>;
    };
    const ids = body.data.map(m => m.id);
    expect(ids).toContain('alive-model');
    expect(ids).not.toContain('skip-model');
  });

  it('calling skipped provider model id returns 404 model_not_found', async () => {
    const app = await buildAppWithSkippedProvider();
    const res = await app.handle(
      new Request('http://localhost/v1/chat/completions', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: 'skip-model',
          messages: [{ role: 'user', content: 'hi' }]
        })
      })
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('model_not_found');
  });
});
