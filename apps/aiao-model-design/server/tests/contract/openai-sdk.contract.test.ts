import OpenAI from 'openai';
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

const buildClient = (): OpenAI =>
  new OpenAI({
    apiKey: token,
    baseURL: 'http://localhost/v1',
    fetch: handleViaApp(app) as unknown as typeof fetch,
    dangerouslyAllowBrowser: true
  });

describe('OpenAI SDK contract — /v1/chat/completions', () => {
  it('non-stream completion echoes user content via mock-echo', async () => {
    const client = buildClient();
    const res = await client.chat.completions.create({
      model: 'mock-echo-1',
      messages: [{ role: 'user', content: 'hello world' }]
    });
    expect(res.object).toBe('chat.completion');
    expect(res.choices[0].message.content).toBe('hello world');
    expect(res.choices[0].finish_reason).toBe('stop');
    expect(res.usage?.total_tokens).toBeGreaterThan(0);
  });

  it('streaming returns OpenAI SSE chunks ending with [DONE]', async () => {
    const client = buildClient();
    const stream = await client.chat.completions.create({
      model: 'mock-echo-1',
      messages: [{ role: 'user', content: 'hi' }],
      stream: true
    });
    let acc = '';
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) acc += delta;
    }
    expect(acc).toBe('hi');
  });

  it('returns 404 model_not_found for unregistered model', async () => {
    const client = buildClient();
    await expect(
      client.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'hi' }]
      })
    ).rejects.toMatchObject({
      status: 404
    });
  });

  it('returns 422 for unsupported field "seed"', async () => {
    const client = buildClient();
    await expect(
      client.chat.completions.create({
        model: 'mock-echo-1',
        messages: [{ role: 'user', content: 'hi' }],
        seed: 42
      })
    ).rejects.toMatchObject({
      status: 422
    });
  });

  it('returns 422 for unsupported field "logprobs"', async () => {
    const client = buildClient();
    await expect(
      client.chat.completions.create({
        model: 'mock-echo-1',
        messages: [{ role: 'user', content: 'hi' }],
        logprobs: true
      })
    ).rejects.toMatchObject({
      status: 422
    });
  });

  it('rejects 401 without token', async () => {
    const noAuth = new OpenAI({
      apiKey: 'invalid',
      baseURL: 'http://localhost/v1',
      fetch: handleViaApp(app) as unknown as typeof fetch,
      dangerouslyAllowBrowser: true
    });
    await expect(
      noAuth.chat.completions.create({
        model: 'mock-echo-1',
        messages: [{ role: 'user', content: 'hi' }]
      })
    ).rejects.toMatchObject({ status: 401 });
  });
});

describe('OpenAI SDK contract — error injection via mock-echo', () => {
  it('propagates 500 server error when mock receives inject-5xx', async () => {
    const client = buildClient();
    await expect(
      client.chat.completions.create({
        model: 'mock-echo-1',
        messages: [{ role: 'user', content: 'inject-5xx' }]
      })
    ).rejects.toMatchObject({ status: 502 });
  });

  it('propagates 429 when mock receives inject-rate-limit', async () => {
    const client = buildClient();
    await expect(
      client.chat.completions.create({
        model: 'mock-echo-1',
        messages: [{ role: 'user', content: 'inject-rate-limit' }]
      })
    ).rejects.toMatchObject({ status: 429 });
  });
});

describe('OpenAI SDK contract — GET /v1/models', () => {
  it('lists registered enabled models', async () => {
    const client = buildClient();
    const list = await client.models.list();
    const ids = list.data.map(m => m.id);
    expect(ids).toContain('mock-echo-1');
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.handle(
      new Request('http://localhost/v1/models', {
        method: 'GET'
      })
    );
    expect(res.status).toBe(401);
  });
});
