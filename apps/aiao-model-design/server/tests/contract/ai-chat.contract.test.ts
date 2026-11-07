// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { bootTestServer, rawRequest, type TestServer } from '../fixtures/test-server';

let ts: TestServer;

beforeAll(async () => {
  ts = await bootTestServer();
});

/**
 * 把 AI SDK data stream 文本流（`0:"text"\n` 每行）解析回 text delta 数组
 */
const parseDataStream = (raw: string): string[] => {
  const out: string[] = [];
  for (const line of raw.split('\n')) {
    if (!line.startsWith('0:')) continue;
    try {
      out.push(JSON.parse(line.slice(2)) as string);
    } catch {
      // 非 text delta 行，跳过
    }
  }
  return out;
};

/**
 * 通用对话协议契约：
 * - POST /api/ai/chat
 * - body: `{ messages: [...], context?: {route?, topic?} }`
 * - 响应：text/plain，AI SDK data stream（`0:"..."` 行格式），与 /api/ai/model/chat 一致
 */
describe('project-compat — /api/ai/chat', () => {
  it('returns AI SDK data stream consuming mock-echo provider', async () => {
    const res = await rawRequest(ts, 'POST', '/api/ai/chat', {
      messages: [{ role: 'user', content: 'hello-generic-chat' }]
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/plain/);
    expect(res.headers.get('x-trace-id')).toBeTruthy();
    const raw = await res.text();
    const deltas = parseDataStream(raw);
    expect(deltas.join('')).toContain('hello-generic-chat');
  });

  it('accepts optional context payload (route/topic)', async () => {
    const res = await rawRequest(ts, 'POST', '/api/ai/chat', {
      messages: [{ role: 'user', content: 'q1' }],
      context: { route: '/model-designer', topic: '模型设计器实体配置' }
    });
    expect(res.status).toBe(200);
    await res.text();
  });

  it('rejects 401 without Bearer token', async () => {
    const res = await ts.app.handle(
      new Request('http://localhost/api/ai/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'hi' }]
        })
      })
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.type).toBe('unauthorized');
  });

  it('accepts cookie-channel auth (access_token=<jwt>)', async () => {
    const req = new Request('http://localhost/api/ai/chat', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `access_token=${ts.token}; other=x`
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'cookie-test' }]
      })
    });
    const res = await ts.app.handle(req);
    expect(res.status).toBe(200);
    const raw = await res.text();
    const deltas = parseDataStream(raw);
    expect(deltas.join('')).toContain('cookie-test');
  });

  it('upstream error writes AI SDK `3:` error frame, no [DONE]', async () => {
    const res = await rawRequest(ts, 'POST', '/api/ai/chat', {
      messages: [{ role: 'user', content: 'inject-5xx' }]
    });
    expect(res.status).toBe(200); // streaming 200 + in-band error
    const raw = await res.text();
    const errorLine = raw.split('\n').find(l => l.startsWith('3:'));
    expect(errorLine).toBeTruthy();
    const payload = JSON.parse(errorLine!.slice(2));
    expect(payload.type).toBe('server');
    expect(payload.status).toBe(502);
    expect(raw).not.toContain('[DONE]');
  });
});
