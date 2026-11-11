import { afterEach, expect, it, vi } from 'vitest';
import { routeRequest, type EdgeEnvironment } from './edge/router';

const user = { id: 'designer-user', email: 'designer@example.com' };
const env: EdgeEnvironment = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-key',
  DEEPSEEK_API_KEY: 'test-server-key',
  ASSETS: { fetch: async () => new Response('frontend') }
};

function responsesStream(content: string): Response {
  const chunks = [
    {
      type: 'response.output_text.delta',
      item_id: 'message-id',
      output_index: 0,
      delta: content
    },
    { type: 'response.completed', response: {} }
  ];
  return new Response(chunks.map(chunk => `event: ${chunk.type}\ndata: ${JSON.stringify(chunk)}\n\n`).join(''), {
    headers: { 'content-type': 'text/event-stream' }
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([
  ['generate', { prompt: '生成用户实体' }, '{"thinking":"用户模型","entities":[]}'],
  ['chat', { messages: [{ role: 'user', content: '为用户增加订单关系' }] }, '可以增加双向关系。']
])('真实 AI SDK 通过 Worker 完成 %s 流式请求', async (action, body, content) => {
  const upstream = vi.fn<typeof fetch>().mockImplementation(async input => {
    const url = String(input);
    if (url.endsWith('/auth/v1/user')) return Response.json(user);
    if (url.endsWith('/responses')) return responsesStream(content);
    throw new Error(`Unexpected upstream: ${url}`);
  });
  vi.stubGlobal('fetch', upstream);
  const response = await routeRequest(
    new Request(`https://designer.example/api/ai/model/${action}`, {
      method: 'POST',
      headers: { cookie: 'access_token=test-user-jwt', 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }),
    env
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain('text/event-stream');
  expect(response.headers.get('cache-control')).toContain('no-transform');
  const text = await response.text();
  const packets = text.split('\n').filter(line => line.startsWith('data: ') && line !== 'data: [DONE]');
  const events = packets.map(line => JSON.parse(line.slice(6)));
  expect(
    events
      .filter(event => event.type === 'text-delta')
      .map(event => event.delta)
      .join('')
  ).toBe(content);
  expect(text).toMatch(/data: \[DONE\]\n\n$/);
  const call = upstream.mock.calls.find(([url]) => String(url).endsWith('/responses'));
  expect(call).toBeDefined();
  expect(new Headers(call?.[1]?.headers).get('authorization')).toBe('Bearer test-server-key');
  const payload = JSON.parse(String(call?.[1]?.body));
  expect(payload.model).toBe('deepseek-flash');
  expect(payload.input[0].role).toBe('system');
  expect(text).not.toContain('test-server-key');
});

it.each(['generate', 'chat'])('上游失败通过 %s SSE 错误事件返回，不暴露密钥', async action => {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>().mockImplementation(async input => {
      if (String(input).endsWith('/auth/v1/user')) return Response.json(user);
      return Response.json({ error: { message: 'private-provider-details' } }, { status: 429 });
    })
  );
  const body = action === 'generate' ? { prompt: '订单' } : { messages: [{ role: 'user', content: '订单' }] };
  const response = await routeRequest(
    new Request(`https://designer.example/api/ai/model/${action}`, {
      method: 'POST',
      headers: { cookie: 'access_token=test-user-jwt', 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }),
    env
  );
  expect(response.headers.get('content-type')).toContain('text/event-stream');
  const text = await response.text();
  const events = text
    .split('\n')
    .filter(line => line.startsWith('data: {'))
    .map(line => JSON.parse(line.slice(6)));
  const error = events.find(event => event.type === 'error');
  expect(JSON.parse(error.errorText)).toMatchObject({ type: 'rate-limit', status: 429 });
  expect(text).not.toContain('private-provider-details');
  expect(text).not.toContain('test-server-key');
});
