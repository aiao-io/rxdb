import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AGENT_TASK, agentConfig, startAgentSession, type AgentEnvironment } from './agent-session';

const upstream = vi.fn<typeof fetch>();
const env: AgentEnvironment = { TRIGGER_SECRET_KEY: 'tr_secret', TRIGGER_API_URL: 'https://trigger.example.com/' };
const user = 'b1946ac9-2b4f-4a47-9c3e-7e6f1a0c5d21';
const chatId = `md-${user}-0b5f2c8a-1d2e-4f3a-9b8c-7d6e5f4a3b2c`;

function sessionRequest(body: unknown): Request {
  return new Request('https://designer.example/api/agent/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', upstream);
  upstream.mockResolvedValue(
    Response.json({ id: 'session_1', publicAccessToken: 'pat-1', isCached: false }, { status: 201 })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe('agentConfig', () => {
  it('配置齐全时返回实例地址与任务 ID，不含密钥', async () => {
    const response = agentConfig(env);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ enabled: true, apiUrl: 'https://trigger.example.com', task: AGENT_TASK });
  });

  it.each([
    ['缺少密钥', { TRIGGER_API_URL: 'https://trigger.example.com' }],
    ['缺少实例地址', { TRIGGER_SECRET_KEY: 'tr_secret' }],
    ['值为空白', { TRIGGER_SECRET_KEY: ' ', TRIGGER_API_URL: ' ' }]
  ])('%s时不可用', async (_name, config) => {
    expect(await agentConfig(config).json()).toEqual({ enabled: false });
  });
});

describe('startAgentSession', () => {
  it('以密钥为本人的 chatId 创建会话，只返回会话令牌', async () => {
    const response = await startAgentSession(sessionRequest({ chatId }), env, user);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ publicAccessToken: 'pat-1' });
    const [url, init] = upstream.mock.calls[0];
    expect(url).toBe('https://trigger.example.com/api/v1/sessions');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer tr_secret');
    expect(JSON.parse(String(init?.body))).toEqual({
      type: 'chat.agent',
      externalId: chatId,
      taskIdentifier: AGENT_TASK,
      triggerConfig: {
        basePayload: { chatId, trigger: 'preload', messages: [] },
        tags: [`chat:${chatId}`]
      }
    });
  });

  it('实例提示版本待部署时透传标记', async () => {
    upstream.mockResolvedValue(Response.json({ publicAccessToken: 'pat-2', pendingVersion: true }));
    expect(await (await startAgentSession(sessionRequest({ chatId }), env, user)).json()).toEqual({
      publicAccessToken: 'pat-2',
      pendingVersion: true
    });
  });

  it.each([
    ['请求体不是 JSON', 'not-json', 400],
    ['缺少 chatId', {}, 400],
    ['chatId 含非法字符', { chatId: `md-${user}-a/b` }, 400],
    ['chatId 不属于本人', { chatId: 'md-someone-else-0b5f2c8a' }, 403],
    ['chatId 只有本人前缀', { chatId: `md-${user}-` }, 400]
  ])('%s时返回 %s 且不调用实例', async (_name, body, status) => {
    expect((await startAgentSession(sessionRequest(body), env, user)).status).toBe(status);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('未配置时返回 503', async () => {
    expect((await startAgentSession(sessionRequest({ chatId }), {}, user)).status).toBe(503);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('会话已关闭时返回 409，让浏览器另开会话', async () => {
    upstream.mockResolvedValue(new Response('closed', { status: 409 }));
    const response = await startAgentSession(sessionRequest({ chatId }), env, user);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ type: 'conflict', status: 409 });
  });

  it.each([
    ['网络失败', () => Promise.reject(new Error('tr_secret leaked'))],
    ['实例返回错误', async () => new Response('tr_secret', { status: 500 })],
    ['响应没有令牌', async () => Response.json({ id: 'session_1' })],
    ['响应不是 JSON', async () => new Response('<html>', { status: 200 })]
  ])('%s时返回 502 且不泄漏密钥', async (_name, reply) => {
    upstream.mockImplementation(reply);
    const response = await startAgentSession(sessionRequest({ chatId }), env, user);
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('tr_secret');
  });
});
