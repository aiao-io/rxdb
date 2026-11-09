import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiApiService } from './ai-api.service';

const delta = (text: string) => `data: ${JSON.stringify({ type: 'text-delta', id: 'text-1', delta: text })}\n\n`;
const done = 'data: [DONE]\n\n';
const finish = 'data: {"type":"finish","finishReason":"stop"}\n\n';

function response(text: string, size = 1024): Response {
  const bytes = new TextEncoder().encode(text);
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (let offset = 0; offset < bytes.length; offset += size)
          controller.enqueue(bytes.slice(offset, offset + size));
        controller.close();
      }
    }),
    { headers: { 'content-type': 'text/event-stream; charset=utf-8' } }
  );
}

describe('AiApiService SSE', () => {
  let service: AiApiService;
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    service = TestBed.inject(AiApiService);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('跨字节分块、心跳、CRLF 和同块多事件仍完整收到中文', async () => {
    fetchMock.mockResolvedValue(
      response(
        (': heartbeat\n\ndata: {"type":"start"}\n\n' + delta('你好') + delta('模型') + done).replaceAll('\n', '\r\n'),
        1
      )
    );
    const onChunk = vi.fn();
    const onPartial = vi.fn();
    const onComplete = vi.fn();
    await service.chat([{ role: 'user', content: '你好' }], { entityNames: [] }, { onChunk, onPartial, onComplete });
    expect(onChunk.mock.calls.map(([text]) => text)).toEqual(['你好', '模型']);
    expect(onPartial.mock.calls.map(([text]) => text)).toEqual(['你好', '你好模型']);
    expect(onComplete).toHaveBeenCalledExactlyOnceWith('你好模型');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ai/model/chat',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.objectContaining({ Accept: 'text/event-stream' })
      })
    );
    expect(service.isStreaming()).toBe(false);
  });

  it('识别 AI SDK finish 事件作为成功结束', async () => {
    fetchMock.mockResolvedValue(response(delta('完成') + finish));
    const onError = vi.fn();
    const onComplete = vi.fn();
    await service.chat([{ role: 'user', content: '模型' }], { entityNames: [] }, { onError, onComplete });
    expect(onError).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledExactlyOnceWith('完成');
  });

  it('连接结束前就推送文本，不等待完整响应', async () => {
    let writer!: ReadableStreamDefaultController<Uint8Array>;
    const encoder = new TextEncoder();
    fetchMock.mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            writer = controller;
          }
        }),
        {
          headers: { 'content-type': 'text/event-stream' }
        }
      )
    );
    const onChunk = vi.fn();
    const onComplete = vi.fn();
    const request = service.chat([{ role: 'user', content: '你好' }], { entityNames: [] }, { onChunk, onComplete });
    writer.enqueue(encoder.encode(delta('第一块')));
    await vi.waitFor(() => expect(onChunk).toHaveBeenCalledWith('第一块'));
    expect(onComplete).not.toHaveBeenCalled();
    expect(service.isStreaming()).toBe(true);
    writer.enqueue(encoder.encode(delta('第二块') + done));
    writer.close();
    await request;
    expect(onComplete).toHaveBeenCalledExactlyOnceWith('第一块第二块');
  });

  it('模型生成向增量解析器传 JSON 文本，同时提供部分对象', async () => {
    const parts = ['{"thinking":"用户', '模型","entities":[]}'];
    fetchMock.mockResolvedValue(response(parts.map(delta).join('') + done, 5));
    const onTextChunk = vi.fn();
    const onPartial = vi.fn();
    const onComplete = vi.fn();
    await service.generate('用户模型', undefined, { onTextChunk, onPartial, onComplete });
    expect(onTextChunk.mock.calls.map(([text]) => text)).toEqual(parts);
    expect(onPartial.mock.calls[0][0]).toMatchObject({ thinking: '用户' });
    expect(onComplete).toHaveBeenCalledExactlyOnceWith({ thinking: '用户模型', entities: [] });
  });

  it('没有原始文本回调也可以逐步生成模型', async () => {
    fetchMock.mockResolvedValue(response(delta('{"thinking":"模型","entities":[]}') + done));
    const onPartial = vi.fn();
    const onComplete = vi.fn();
    await service.generate('模型', undefined, { onPartial, onComplete });
    expect(onPartial).toHaveBeenCalledWith({ thinking: '模型', entities: [] });
    expect(onComplete).toHaveBeenCalledExactlyOnceWith({ thinking: '模型', entities: [] });
  });

  it('流中错误只触发错误回调，保留已有文本', async () => {
    const error = { type: 'rate-limit', message: 'AI rate limit exceeded', status: 429 };
    fetchMock.mockResolvedValue(
      response(
        delta('已生成') + `data: ${JSON.stringify({ type: 'error', errorText: JSON.stringify(error) })}\n\n` + done
      )
    );
    const onPartial = vi.fn();
    const onError = vi.fn();
    const onComplete = vi.fn();
    await service.chat([{ role: 'user', content: '模型' }], { entityNames: [] }, { onPartial, onError, onComplete });
    expect(onPartial).toHaveBeenCalledWith('已生成');
    expect(onError).toHaveBeenCalledExactlyOnceWith(error);
    expect(onComplete).not.toHaveBeenCalled();
    expect(service.isStreaming()).toBe(false);
  });

  it.each([
    ['提前断流', delta('未完成')],
    ['损坏事件', 'data: {broken}\n\n' + done],
    ['损坏文本事件', 'data: {"type":"text-delta"}\n\n' + done],
    ['文本字段类型错误', 'data: {"type":"text-delta","delta":123}\n\n' + done],
    [
      '错误分类无效',
      `data: ${JSON.stringify({ type: 'error', errorText: JSON.stringify({ type: 'unknown', message: 'bad' }) })}\n\n` + done
    ],
    ['损坏错误事件', 'data: {"type":"error","errorText":"bad"}\n\n' + done]
  ])('%s 不冒充成功', async (_name, text) => {
    fetchMock.mockResolvedValue(response(text));
    const onError = vi.fn();
    const onComplete = vi.fn();
    await service.chat([{ role: 'user', content: '模型' }], { entityNames: [] }, { onError, onComplete });
    expect(onError).toHaveBeenCalledOnce();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('错误事件省略 status 时保持错误对象形状', async () => {
    const error = { type: 'server' as const, message: 'upstream failed' };
    fetchMock.mockResolvedValue(
      response(`data: ${JSON.stringify({ type: 'error', errorText: JSON.stringify(error) })}\n\n` + done)
    );
    const onError = vi.fn();
    await service.chat([{ role: 'user', content: '模型' }], { entityNames: [] }, { onError });
    expect(onError).toHaveBeenCalledExactlyOnceWith(error);
  });

  it('生成结果不是完整 JSON 时提示错误', async () => {
    fetchMock.mockResolvedValue(response(delta('{"thinking":') + done));
    const onError = vi.fn();
    const onComplete = vi.fn();
    await service.generate('模型', undefined, { onTextChunk: vi.fn(), onError, onComplete });
    expect(onError).toHaveBeenCalledOnce();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('错误响应类型不当作 SSE 消费', async () => {
    fetchMock.mockResolvedValue(new Response('plain text'));
    const onError = vi.fn();
    await service.chat([{ role: 'user', content: '模型' }], { entityNames: [] }, { onError });
    expect(onError).toHaveBeenCalledOnce();
  });

  it.each([
    [400, 'validation'],
    [401, 'unauthorized'],
    [429, 'rate-limit'],
    [504, 'timeout'],
    [502, 'server']
  ])('HTTP %s 保留错误分类 %s', async (status, type) => {
    fetchMock.mockResolvedValue(new Response('{}', { status: Number(status) }));
    const onError = vi.fn();
    await service.generate('模型', undefined, { onError });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ type, status }));
  });

  it('服务端中止事件不触发成功回调', async () => {
    fetchMock.mockResolvedValue(response(delta('部分模型') + 'data: {"type":"abort"}\n\n' + done));
    const onError = vi.fn();
    const onComplete = vi.fn();
    await service.chat([{ role: 'user', content: '模型' }], { entityNames: [] }, { onError, onComplete });
    expect(onError).toHaveBeenCalledExactlyOnceWith({ type: 'network', message: 'AbortError' });
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('接收部分内容后仍可取消，保留已展示内容并释放读取器', async () => {
    const encoder = new TextEncoder();
    fetchMock.mockImplementation((_url, init) =>
      Promise.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(encoder.encode(delta('部分模型')));
              init!.signal!.addEventListener(
                'abort',
                () => controller.error(new DOMException('Aborted', 'AbortError')),
                { once: true }
              );
            }
          }),
          { headers: { 'content-type': 'text/event-stream' } }
        )
      )
    );
    const onPartial = vi.fn();
    const onError = vi.fn();
    const onComplete = vi.fn();
    const request = service.chat(
      [{ role: 'user', content: '模型' }],
      { entityNames: [] },
      { onPartial, onError, onComplete }
    );
    await vi.waitFor(() => expect(onPartial).toHaveBeenCalledWith('部分模型'));
    service.abort();
    await request;
    expect(onError).toHaveBeenCalledExactlyOnceWith({ type: 'network', message: 'AbortError' });
    expect(onComplete).not.toHaveBeenCalled();
    expect(service.isStreaming()).toBe(false);
  });

  it('取消请求中止 fetch 并复原状态', async () => {
    let signal!: AbortSignal;
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          signal = init!.signal!;
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        })
    );
    const onError = vi.fn();
    const request = service.chat([{ role: 'user', content: '模型' }], { entityNames: [] }, { onError });
    expect(service.isStreaming()).toBe(true);
    service.abort();
    await request;
    expect(signal.aborted).toBe(true);
    expect(service.isStreaming()).toBe(false);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'AbortError' }));
  });
});
