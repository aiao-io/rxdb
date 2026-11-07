import Anthropic from '@anthropic-ai/sdk';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWTVerifyGetKey, type KeyObject } from 'jose';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import OpenAI from 'openai';
import { createApp } from '../../src/bootstrap';
import { MockAsrProvider } from '../../src/gateway/providers/mock-asr.provider';
import { MockEchoProvider } from '../../src/gateway/providers/mock-echo.provider';
import { MockTtsProvider } from '../../src/gateway/providers/mock-tts.provider';
import type { ProviderFactory } from '../../src/gateway/registry/provider-registry';

const ISSUER = 'https://test.supabase.co/auth/v1';
const AUDIENCE = 'authenticated';

export const FIXTURE_PROVIDERS_YAML = new URL('./providers.test.yaml', import.meta.url).pathname;

export interface TestServer {
  app: Awaited<ReturnType<typeof createApp>>;
  token: string;
  jwks: JWTVerifyGetKey;
  privateKey: KeyObject;
  fetchVia: typeof fetch;
  /** mock-echo provider 实例引用；同一引用应被 OpenAI / Anthropic 入口共享（FR-052） */
  mockEcho: MockEchoProvider;
  /** mock-asr provider 实例引用 */
  mockAsr: MockAsrProvider;
  /** mock-tts provider 实例引用（无 reference_voice capability） */
  mockTts: MockTtsProvider;
  /** mock-tts-ref provider 实例引用（声明 reference_voice capability） */
  mockTtsRef: MockTtsProvider;
}

/**
 * 启动一个 in-process 测试 server，注入 mock-echo provider + 本地 JWKS
 *
 * 用法：
 *   const ts = await bootTestServer();
 *   const client = buildOpenAiClient(ts);
 *   const res = await client.chat.completions.create({...});
 */
export async function bootTestServer(): Promise<TestServer> {
  const pair = await generateKeyPair('ES256', { extractable: true });
  const privateKey = pair.privateKey as KeyObject;
  const jwk = await exportJWK(pair.publicKey as KeyObject);
  jwk.kid = 'test-key';
  jwk.alg = 'ES256';
  const jwks = createLocalJWKSet({ keys: [jwk] });

  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject('user-test')
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(privateKey);

  process.env.SUPABASE_JWT_AUDIENCE = AUDIENCE;
  process.env.SUPABASE_JWT_ISSUER = ISSUER;

  // 拦截 mock-echo / mock-asr 工厂以暴露实例引用，用于 single-provider-instance 等测试
  let mockEchoInstance: MockEchoProvider | null = null;
  const mockEchoIntercept: ProviderFactory = {
    id: 'mock-echo',
    modality: 'chat',
    build(config) {
      const instance = new MockEchoProvider({
        modelIds: config.modelIds,
        capabilities: config.capabilities
      });
      mockEchoInstance = instance;
      return instance;
    }
  };

  let mockAsrInstance: MockAsrProvider | null = null;
  const mockAsrIntercept: ProviderFactory = {
    id: 'mock-asr',
    modality: 'asr',
    build(config) {
      const instance = new MockAsrProvider({
        modelIds: config.modelIds,
        capabilities: config.capabilities
      });
      mockAsrInstance = instance;
      return instance;
    }
  };

  let mockTtsInstance: MockTtsProvider | null = null;
  const mockTtsIntercept: ProviderFactory = {
    id: 'mock-tts',
    modality: 'tts',
    build(config) {
      const instance = new MockTtsProvider({
        modelIds: config.modelIds,
        capabilities: config.capabilities
      });
      mockTtsInstance = instance;
      return instance;
    }
  };

  let mockTtsRefInstance: MockTtsProvider | null = null;
  const mockTtsRefIntercept: ProviderFactory = {
    id: 'mock-tts-ref',
    modality: 'tts',
    build(config) {
      const instance = new MockTtsProvider({
        modelIds: config.modelIds,
        capabilities: config.capabilities
      });
      mockTtsRefInstance = instance;
      return instance;
    }
  };

  const retentionDir = mkdtempSync(join(tmpdir(), 'aiao-gateway-test-'));
  const app = await createApp({
    factories: [mockEchoIntercept, mockAsrIntercept, mockTtsIntercept, mockTtsRefIntercept],
    jwksUrl: 'http://unused.local',
    jwksOverride: jwks,
    providersConfigPath: FIXTURE_PROVIDERS_YAML,
    retentionRootDir: retentionDir
  });

  if (!mockEchoInstance || !mockAsrInstance || !mockTtsInstance || !mockTtsRefInstance) {
    throw new Error('bootTestServer: mock factories were not invoked');
  }

  const fetchVia = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    // Node fetch 在 body 是 ReadableStream 时要求 duplex: 'half'
    // OpenAI SDK 用 streaming body 上传 multipart 时会触发；显式补齐避免 InvalidStateError
    const augmented = init?.body ? ({ ...init, duplex: 'half' } as RequestInit & { duplex: 'half' }) : init;
    const req = new Request(input as RequestInfo, augmented);
    return app.handle(req);
  }) as unknown as typeof fetch;

  return {
    app,
    token,
    jwks,
    privateKey,
    fetchVia,
    mockEcho: mockEchoInstance,
    mockAsr: mockAsrInstance,
    mockTts: mockTtsInstance,
    mockTtsRef: mockTtsRefInstance
  };
}

export function buildOpenAiClient(ts: TestServer): OpenAI {
  return new OpenAI({
    apiKey: ts.token,
    baseURL: 'http://localhost/v1',
    fetch: ts.fetchVia,
    dangerouslyAllowBrowser: true
  });
}

export function buildAnthropicClient(ts: TestServer): Anthropic {
  return new Anthropic({
    apiKey: ts.token,
    // 显式置空，避免 SDK 从环境变量 ANTHROPIC_AUTH_TOKEN 自动读取真实凭证
    // 并作为 Authorization: Bearer 头覆盖测试用的 x-api-key JWT
    authToken: null,
    baseURL: 'http://localhost',
    fetch: ts.fetchVia,
    dangerouslyAllowBrowser: true
  });
}

/**
 * 直接构造 Request 调用 app.handle()，绕过 SDK，便于断言 raw headers / body
 */
export async function rawRequest(
  ts: TestServer,
  method: string,
  path: string,
  body: unknown,
  extraHeaders: Record<string, string> = {}
): Promise<Response> {
  return ts.app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${ts.token}`,
        ...extraHeaders
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
  );
}
