import { describe, expect, it } from 'vitest';
import { UpstreamHttpError } from '../../src/gateway/core/errors';
import type { RequestContext } from '../../src/gateway/core/types';
import type { ChatStreamEvent } from '../../src/gateway/providers/types';
import { serializeOpenAiChatStream } from '../../src/routes/gateway/openai/stream-serializer';

const TRACE_ID = '11111111-2222-3333-4444-555555555555';
const REQUESTED_AT = 1715817600_000; // 2024-05-16T00:00:00Z 整数秒

const makeCtx = (overrides: Partial<RequestContext> = {}): RequestContext => {
  const clientCtrl = new AbortController();
  const timeoutCtrl = new AbortController();
  return {
    traceId: TRACE_ID,
    entry: 'openai-v1',
    modality: 'chat',
    userId: null,
    authChannel: null,
    requestedAt: REQUESTED_AT,
    clientSignal: clientCtrl.signal,
    timeoutSignal: timeoutCtrl.signal,
    combinedSignal: AbortSignal.any([clientCtrl.signal, timeoutCtrl.signal]),
    retentionFiles: [],
    ...overrides
  };
};

const collect = async (stream: ReadableStream<Uint8Array>): Promise<string> => {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let acc = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    acc += decoder.decode(value);
  }
  return acc;
};

const sourceOf = (events: ChatStreamEvent[]): AsyncIterable<ChatStreamEvent> => ({
  async *[Symbol.asyncIterator]() {
    for (const e of events) yield e;
  }
});

const failingSource = (events: ChatStreamEvent[], err: Error): AsyncIterable<ChatStreamEvent> => ({
  async *[Symbol.asyncIterator]() {
    for (const e of events) yield e;
    throw err;
  }
});

const parseChunks = (raw: string): unknown[] => {
  const frames = raw
    .split('\n\n')
    .filter(f => f.startsWith('data: '))
    .map(f => f.slice(6));
  return frames.map(f => (f === '[DONE]' ? '[DONE]' : JSON.parse(f)));
};

describe('serializeOpenAiChatStream — happy path', () => {
  it('emits role: assistant on first text-delta only', async () => {
    const stream = serializeOpenAiChatStream({
      source: sourceOf([
        { kind: 'text-delta', delta: 'he' },
        { kind: 'text-delta', delta: 'llo' },
        { kind: 'finish', reason: 'stop' }
      ]),
      modelId: 'deepseek-chat',
      ctx: makeCtx()
    });
    const raw = await collect(stream);
    const chunks = parseChunks(raw);
    expect(chunks[0]).toMatchObject({
      id: `chatcmpl-${TRACE_ID}`,
      object: 'chat.completion.chunk',
      model: 'deepseek-chat',
      choices: [{ index: 0, delta: { role: 'assistant', content: 'he' }, finish_reason: null }]
    });
    expect(chunks[1]).toMatchObject({
      choices: [{ delta: { content: 'llo' }, finish_reason: null }]
    });
    expect((chunks[1] as { choices: Array<{ delta: { role?: string } }> }).choices[0].delta.role).toBeUndefined();
  });

  it('writes finish chunk with empty delta + finish_reason, then [DONE]', async () => {
    const stream = serializeOpenAiChatStream({
      source: sourceOf([
        { kind: 'text-delta', delta: 'x' },
        { kind: 'finish', reason: 'stop' }
      ]),
      modelId: 'deepseek-chat',
      ctx: makeCtx()
    });
    const raw = await collect(stream);
    expect(raw.endsWith('data: [DONE]\n\n')).toBe(true);
    const chunks = parseChunks(raw);
    const finishChunk = chunks[chunks.length - 2] as { choices: Array<{ delta: object; finish_reason: string }> };
    expect(finishChunk.choices[0].delta).toEqual({});
    expect(finishChunk.choices[0].finish_reason).toBe('stop');
    expect(chunks[chunks.length - 1]).toBe('[DONE]');
  });

  it('omits usage chunk when includeUsage=false', async () => {
    const stream = serializeOpenAiChatStream({
      source: sourceOf([
        { kind: 'text-delta', delta: 'x' },
        { kind: 'usage', promptTokens: 10, completionTokens: 1 },
        { kind: 'finish', reason: 'stop' }
      ]),
      modelId: 'deepseek-chat',
      ctx: makeCtx()
    });
    const chunks = parseChunks(await collect(stream));
    expect(chunks.some(c => typeof c === 'object' && c !== null && 'usage' in c)).toBe(false);
  });

  it('emits usage chunk when includeUsage=true', async () => {
    const stream = serializeOpenAiChatStream({
      source: sourceOf([
        { kind: 'text-delta', delta: 'x' },
        { kind: 'usage', promptTokens: 10, completionTokens: 5 },
        { kind: 'finish', reason: 'stop' }
      ]),
      modelId: 'deepseek-chat',
      ctx: makeCtx(),
      includeUsage: true
    });
    const chunks = parseChunks(await collect(stream));
    const usageChunk = chunks.find(c => typeof c === 'object' && c !== null && 'usage' in c) as {
      choices: unknown[];
      usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };
    expect(usageChunk.choices).toEqual([]);
    expect(usageChunk.usage).toEqual({ prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 });
  });

  it('encodes created as integer seconds from requestedAt', async () => {
    const stream = serializeOpenAiChatStream({
      source: sourceOf([
        { kind: 'text-delta', delta: 'x' },
        { kind: 'finish', reason: 'stop' }
      ]),
      modelId: 'deepseek-chat',
      ctx: makeCtx()
    });
    const chunks = parseChunks(await collect(stream));
    const first = chunks[0] as { created: number };
    expect(first.created).toBe(Math.floor(REQUESTED_AT / 1000));
  });
});

describe('serializeOpenAiChatStream — FR-007 stream error event', () => {
  it('writes {"error": ...} frame and closes WITHOUT [DONE]', async () => {
    const stream = serializeOpenAiChatStream({
      source: failingSource([{ kind: 'text-delta', delta: 'x' }], new UpstreamHttpError(500, 'mock-fail')),
      modelId: 'deepseek-chat',
      ctx: makeCtx()
    });
    const raw = await collect(stream);
    expect(raw).not.toContain('[DONE]');
    const chunks = parseChunks(raw);
    const errChunk = chunks[chunks.length - 1] as { error: { message: string; type: string } };
    expect(errChunk.error.type).toBe('api_error');
    expect(errChunk.error.message).toContain('mock-fail');
  });

  it('does not emit error frame when client aborted (cancel, not error)', async () => {
    const clientCtrl = new AbortController();
    clientCtrl.abort();
    const ctx = makeCtx({ clientSignal: clientCtrl.signal });
    const stream = serializeOpenAiChatStream({
      source: failingSource([{ kind: 'text-delta', delta: 'x' }], new DOMException('aborted', 'AbortError')),
      modelId: 'deepseek-chat',
      ctx
    });
    const raw = await collect(stream);
    expect(raw).not.toContain('"error"');
    expect(raw).not.toContain('[DONE]');
  });
});
