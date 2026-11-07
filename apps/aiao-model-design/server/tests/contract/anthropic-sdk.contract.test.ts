import Anthropic from '@anthropic-ai/sdk';
import { beforeAll, describe, expect, it } from 'vitest';
import { bootTestServer, type TestServer } from '../fixtures/test-server';

let ts: TestServer;
let token: string;
let app: TestServer['app'];

beforeAll(async () => {
  ts = await bootTestServer();
  token = ts.token;
  app = ts.app;
});

const handleViaApp = (appInstance: TestServer['app']): typeof fetch =>
  (async (input: RequestInfo | URL, init?: RequestInit) => {
    const augmented = init?.body ? ({ ...init, duplex: 'half' } as RequestInit & { duplex: 'half' }) : init;
    const req = new Request(input as RequestInfo, augmented);
    return appInstance.handle(req);
  }) as unknown as typeof fetch;

const buildClient = (): Anthropic =>
  new Anthropic({
    apiKey: token,
    // 显式置空，避免 SDK 从环境变量 ANTHROPIC_AUTH_TOKEN 自动读取真实凭证
    // 并作为 Authorization: Bearer 头覆盖测试用的 x-api-key JWT
    authToken: null,
    baseURL: 'http://localhost',
    fetch: handleViaApp(app),
    dangerouslyAllowBrowser: true
  });

describe('Anthropic SDK contract — /v1/messages', () => {
  it('non-stream message echoes via mock-echo', async () => {
    const client = buildClient();
    const res = await client.messages.create({
      model: 'mock-echo-1',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'hello anthropic' }]
    });
    expect(res.type).toBe('message');
    expect(res.role).toBe('assistant');
    expect((res.content[0] as { type: string; text: string }).text).toBe('hello anthropic');
    expect(res.stop_reason).toBe('end_turn');
    expect(res.model).toBe('mock-echo-1');
    expect(res.id).toMatch(/^msg_/);
  });

  it('top-level system field is merged into system role', async () => {
    const client = buildClient();
    const res = await client.messages.create({
      model: 'mock-echo-1',
      max_tokens: 100,
      system: 'You are a helpful AI.',
      messages: [{ role: 'user', content: 'q' }]
    });
    // mock-echo only echoes last user message, so system content not visible
    // 仅断言请求被正常处理
    expect(res.type).toBe('message');
  });

  it('streaming emits Anthropic SSE event sequence', async () => {
    const client = buildClient();
    const stream = await client.messages.stream({
      model: 'mock-echo-1',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'streamed' }]
    });
    let acc = '';
    for await (const evt of stream) {
      if (evt.type === 'content_block_delta' && evt.delta.type === 'text_delta') {
        acc += evt.delta.text;
      }
    }
    expect(acc).toBe('streamed');
  });

  it('404 for unregistered model', async () => {
    const client = buildClient();
    await expect(
      client.messages.create({
        model: 'claude-3-5-sonnet',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'hi' }]
      })
    ).rejects.toMatchObject({ status: 404 });
  });

  it('422 for tools field (unsupported)', async () => {
    const client = buildClient();
    await expect(
      client.messages.create({
        model: 'mock-echo-1',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'hi' }],
        tools: [{ name: 'test', description: 'x', input_schema: { type: 'object' } }]
      })
    ).rejects.toMatchObject({ status: 422 });
  });

  it('accepts anthropic-version header with arbitrary date', async () => {
    const res = await app.handle(
      new Request('http://localhost/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': token,
          'content-type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'mock-echo-1',
          max_tokens: 100,
          messages: [{ role: 'user', content: 'version test' }]
        })
      })
    );
    expect(res.status).toBe(200);
  });

  it('rejects requests without auth', async () => {
    const res = await app.handle(
      new Request('http://localhost/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'mock-echo-1',
          max_tokens: 100,
          messages: [{ role: 'user', content: 'hi' }]
        })
      })
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.type).toBe('error');
    expect(body.error.type).toBe('authentication_error');
  });
});
