import { describe, expect, it } from 'vitest';
import { UpstreamHttpError } from '../../src/gateway/core/errors';
import type { RequestContext } from '../../src/gateway/core/types';
import type { ChatStreamEvent } from '../../src/gateway/providers/types';
import { serializeAnthropicMessagesStream } from '../../src/routes/gateway/anthropic/stream-serializer';

const TRACE_ID = '11111111-2222-3333-4444-555555555555';

const makeCtx = (overrides: Partial<RequestContext> = {}): RequestContext => {
  const c = new AbortController();
  const t = new AbortController();
  return {
    traceId: TRACE_ID,
    entry: 'anthropic-v1',
    modality: 'chat',
    userId: null,
    authChannel: null,
    requestedAt: 1715817600_000,
    clientSignal: c.signal,
    timeoutSignal: t.signal,
    combinedSignal: AbortSignal.any([c.signal, t.signal]),
    retentionFiles: [],
    ...overrides
  };
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

const parseEvents = (raw: string): Array<{ event: string; data: unknown }> => {
  const out: Array<{ event: string; data: unknown }> = [];
  for (const frame of raw.split('\n\n')) {
    const lines = frame.split('\n');
    let event = '';
    let dataRaw = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) event = line.slice(7);
      else if (line.startsWith('data: ')) dataRaw = line.slice(6);
    }
    if (event && dataRaw) out.push({ event, data: JSON.parse(dataRaw) });
  }
  return out;
};

describe('serializeAnthropicMessagesStream — happy path event sequence', () => {
  it('emits message_start → content_block_start → deltas → stop → message_delta → message_stop', async () => {
    const stream = serializeAnthropicMessagesStream({
      source: sourceOf([
        { kind: 'text-delta', delta: 'he' },
        { kind: 'text-delta', delta: 'llo' },
        { kind: 'usage', promptTokens: 10, completionTokens: 2 },
        { kind: 'finish', reason: 'stop' }
      ]),
      modelId: 'deepseek-chat',
      ctx: makeCtx()
    });
    const events = parseEvents(await collect(stream));
    const types = events.map(e => e.event);
    expect(types).toEqual([
      'message_start',
      'content_block_start',
      'content_block_delta',
      'content_block_delta',
      'content_block_stop',
      'message_delta',
      'message_stop'
    ]);
  });

  it('message_start carries model id and zero usage', async () => {
    const stream = serializeAnthropicMessagesStream({
      source: sourceOf([{ kind: 'finish', reason: 'stop' }]),
      modelId: 'deepseek-chat',
      ctx: makeCtx()
    });
    const events = parseEvents(await collect(stream));
    const start = events[0].data as {
      message: { model: string; usage: { input_tokens: number; output_tokens: number } };
    };
    expect(start.message.model).toBe('deepseek-chat');
    expect(start.message.usage).toEqual({ input_tokens: 0, output_tokens: 0 });
  });

  it('content_block_delta payload uses text_delta type', async () => {
    const stream = serializeAnthropicMessagesStream({
      source: sourceOf([
        { kind: 'text-delta', delta: 'x' },
        { kind: 'finish', reason: 'stop' }
      ]),
      modelId: 'deepseek-chat',
      ctx: makeCtx()
    });
    const events = parseEvents(await collect(stream));
    const delta = events.find(e => e.event === 'content_block_delta')!.data as {
      delta: { type: string; text: string };
    };
    expect(delta.delta).toEqual({ type: 'text_delta', text: 'x' });
  });

  it('message_delta carries stop_reason and final usage', async () => {
    const stream = serializeAnthropicMessagesStream({
      source: sourceOf([
        { kind: 'usage', promptTokens: 100, completionTokens: 50 },
        { kind: 'finish', reason: 'length' }
      ]),
      modelId: 'deepseek-chat',
      ctx: makeCtx()
    });
    const events = parseEvents(await collect(stream));
    const delta = events.find(e => e.event === 'message_delta')!.data as {
      delta: { stop_reason: string };
      usage: { input_tokens: number; output_tokens: number };
    };
    expect(delta.delta.stop_reason).toBe('max_tokens');
    expect(delta.usage).toEqual({ input_tokens: 100, output_tokens: 50 });
  });
});

describe('serializeAnthropicMessagesStream — FR-007 error event', () => {
  it('emits event: error with Anthropic error body on upstream failure', async () => {
    const stream = serializeAnthropicMessagesStream({
      source: failingSource([{ kind: 'text-delta', delta: 'x' }], new UpstreamHttpError(429, 'rate limited')),
      modelId: 'deepseek-chat',
      ctx: makeCtx()
    });
    const events = parseEvents(await collect(stream));
    const lastTwo = events.slice(-2).map(e => e.event);
    expect(lastTwo).toEqual(['content_block_stop', 'error']);
    const err = events[events.length - 1].data as {
      type: string;
      error: { type: string; message: string };
    };
    expect(err.type).toBe('error');
    expect(err.error.type).toBe('rate_limit_error');
    expect(err.error.message).toContain('rate limited');
  });

  it('does NOT emit message_stop after error', async () => {
    const stream = serializeAnthropicMessagesStream({
      source: failingSource([], new UpstreamHttpError(500, 'oops')),
      modelId: 'deepseek-chat',
      ctx: makeCtx()
    });
    const events = parseEvents(await collect(stream));
    expect(events.map(e => e.event)).not.toContain('message_stop');
  });

  it('client abort produces no error event (cancel)', async () => {
    const clientCtrl = new AbortController();
    clientCtrl.abort();
    const stream = serializeAnthropicMessagesStream({
      source: failingSource([], new DOMException('aborted', 'AbortError')),
      modelId: 'deepseek-chat',
      ctx: makeCtx({ clientSignal: clientCtrl.signal })
    });
    const events = parseEvents(await collect(stream));
    expect(events.map(e => e.event)).not.toContain('error');
  });
});
