import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAiResponse } from './ai';

const { runStream, createProvider, model, toSseResponse } = vi.hoisted(() => {
  const model = vi.fn(() => 'deepseek-model');
  return { runStream: vi.fn(), createProvider: vi.fn(() => model), model, toSseResponse: vi.fn() };
});
vi.mock('ai', async importOriginal => ({ ...(await importOriginal<typeof import('ai')>()), streamText: runStream }));
vi.mock('@ai-sdk/deepseek', () => ({ createDeepSeek: createProvider }));
const env = { DEEPSEEK_API_KEY: 'server-only-key' };
const post = (path: string, body: unknown, signal?: AbortSignal) =>
  new Request(`https://designer.example/api/ai/model/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal
  });

beforeEach(() => {
  vi.clearAllMocks();
  toSseResponse.mockImplementation(({ headers }) => new Response('data: [DONE]\n\n', {
    headers: { ...headers, 'content-type': 'text/event-stream' }
  }));
  runStream.mockReturnValue({ toUIMessageStreamResponse: toSseResponse });
});
afterEach(() => vi.restoreAllMocks());

describe('模型生成协议', () => {
  it('使用标准 SSE 传输并保留原生成提示词', async () => {
    const response = await createAiResponse(post('generate', { prompt: '生成订单模型' }), env);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(response.headers.get('cache-control')).toContain('no-transform');
    expect(await response.text()).toBe('data: [DONE]\n\n');
    expect(runStream.mock.calls[0][0]).toMatchObject({
      model: 'deepseek-model',
      prompt: '生成订单模型',
      maxRetries: 0
    });
    expect(runStream.mock.calls[0][0].system).toContain('双向关系');
    expect(runStream.mock.calls[0][0].output).toBeDefined();
    expect(createProvider).toHaveBeenCalledWith({ apiKey: 'server-only-key', baseURL: 'https://api.deepseek.com/v1' });
  });
  it('现有实体和 UUID 加入增量生成上下文', async () => {
    await createAiResponse(
      post('generate', {
        prompt: '增加订单',
        existingModel: { entityNames: ['User'], entities: [{ id: 'entity-id', name: 'User' }] }
      }),
      env
    );
    expect(runStream.mock.calls[0][0].system).toContain('entity-id');
    expect(runStream.mock.calls[0][0].system).toContain('User');
  });
  it('空的现有实体列表仍可生成', async () => {
    await createAiResponse(post('generate', { prompt: '生成订单', existingModel: { entityNames: [] } }), env);
    expect(runStream.mock.calls[0][0].system).toContain('已有实体名称');
  });
  it('服务端配置控制模型和上游地址', async () => {
    await createAiResponse(post('generate', { prompt: '订单' }), {
      ...env,
      DEEPSEEK_BASE_URL: 'https://proxy.example/v1/',
      DEEPSEEK_MODEL: 'deepseek-v4-pro'
    });
    expect(createProvider).toHaveBeenCalledWith({ apiKey: 'server-only-key', baseURL: 'https://proxy.example/v1' });
    expect(model).toHaveBeenCalledWith('deepseek-v4-pro');
  });
  it('缺少密钥时返回 503', async () => {
    expect((await createAiResponse(post('generate', { prompt: '订单' }), {})).status).toBe(503);
    expect(runStream).not.toHaveBeenCalled();
  });
  it.each([
    { prompt: '' },
    { prompt: 'a'.repeat(5001) },
    {},
    { prompt: 1 },
    { prompt: '订单', existingModel: { entityNames: Array(201).fill('Entity') } }
  ])('拒绝无效参数 %j', async body => {
    expect((await createAiResponse(post('generate', body), env)).status).toBe(400);
    expect(runStream).not.toHaveBeenCalled();
  });
  it('拒绝损坏的 JSON', async () => {
    const response = await createAiResponse(
      new Request('https://designer.example/api/ai/model/generate', { method: 'POST', body: '{' }),
      env
    );
    expect(response.status).toBe(400);
  });
  it('客户端取消传入 AI SDK', async () => {
    const controller = new AbortController();
    await createAiResponse(post('generate', { prompt: '订单' }, controller.signal), env);
    controller.abort();
    expect(runStream.mock.calls[0][0].abortSignal.aborted).toBe(true);
  });
});

describe('模型迭代对话协议', () => {
  it('使用标准 SSE 传输对话，保留选中实体上下文', async () => {
    const response = await createAiResponse(
      post('chat', {
        messages: [{ role: 'user', content: '增加订单' }],
        modelContext: { entityNames: ['User'], selectedEntity: { id: 'user-id', name: 'User' }, relatedEntities: [] }
      }),
      env
    );
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(toSseResponse).toHaveBeenCalledWith(expect.objectContaining({ onError: expect.any(Function) }));
    expect(runStream.mock.calls[0][0].system).toContain('user-id');
    expect(runStream.mock.calls[0][0].system).toContain('json:model-change');
  });
  it('没有上下文时仍可对话', async () => {
    expect((await createAiResponse(post('chat', { messages: [{ role: 'user', content: '你好' }] }), env)).status).toBe(
      200
    );
  });
  it.each([
    { messages: [] },
    { messages: [{ role: 'system', content: 'x' }] },
    { messages: [{ role: 'user', content: '' }] }
  ])('拒绝无效对话 %j', async body => {
    expect((await createAiResponse(post('chat', body), env)).status).toBe(400);
  });
  it('流中错误掩盖上游私密信息', async () => {
    await createAiResponse(post('chat', { messages: [{ role: 'user', content: '你好' }] }), env);
    const text = toSseResponse.mock.calls[0][0].onError(new Error('private-key-details'));
    expect(JSON.parse(text)).toMatchObject({ type: 'server', status: 502 });
    expect(text).not.toContain('private-key-details');
  });
  it('流中超时保留错误分类', async () => {
    await createAiResponse(post('generate', { prompt: '模型' }), env);
    const timeout = new Error('private-timeout');
    timeout.name = 'TimeoutError';
    expect(JSON.parse(toSseResponse.mock.calls[0][0].onError(timeout))).toMatchObject({ type: 'timeout', status: 504 });
  });
  it('创建上游请求失败返回 JSON 错误', async () => {
    runStream.mockImplementation(() => {
      throw new Error('private-key-details');
    });
    const response = await createAiResponse(post('generate', { prompt: '订单' }), env);
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('private-key-details');
  });
  it('移除的服务端接口返回 404', async () => {
    expect((await createAiResponse(post('validate', {}), env)).status).toBe(404);
  });
});
