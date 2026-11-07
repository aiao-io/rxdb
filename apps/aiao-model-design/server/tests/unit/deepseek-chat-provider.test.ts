// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UpstreamHttpError } from '../../src/gateway/core/errors';
import { DeepSeekChatProvider } from '../../src/gateway/providers/deepseek-chat.provider';
import type { ChatRequest, ChatStreamEvent } from '../../src/gateway/providers/types';

const sdk = vi.hoisted(() => ({
  createDeepSeek: vi.fn(),
  generateText: vi.fn(),
  streamText: vi.fn()
}));

vi.mock('@ai-sdk/deepseek', () => ({ createDeepSeek: sdk.createDeepSeek }));
vi.mock('ai', () => ({ generateText: sdk.generateText, streamText: sdk.streamText }));

const SIGNAL = new AbortController().signal;
const REQUEST: ChatRequest = {
  modelId: 'deepseek-chat',
  messages: [
    { role: 'system', content: 'be concise' },
    { role: 'user', content: 'hello' }
  ],
  temperature: 0.2,
  topP: 0.8,
  maxTokens: 128,
  stop: ['END'],
  stream: false
};

const textStream = (chunks: readonly string[]): AsyncIterable<string> => ({
  async *[Symbol.asyncIterator]() {
    for (const chunk of chunks) yield chunk;
  }
});

const makeProvider = () =>
  new DeepSeekChatProvider({
    baseUrl: 'https://deepseek.test',
    apiKey: 'deepseek-secret',
    modelIds: ['deepseek-chat'],
    capabilities: ['stream']
  });

const collect = async (source: AsyncIterable<ChatStreamEvent>): Promise<ChatStreamEvent[]> => {
  const events: ChatStreamEvent[] = [];
  for await (const event of source) events.push(event);
  return events;
};

beforeEach(() => {
  sdk.createDeepSeek.mockReturnValue(vi.fn(modelId => ({ modelId })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('DeepSeekChatProvider', () => {
  it('constructs the SDK client and exposes configured metadata', () => {
    const provider = makeProvider();

    expect(provider).toMatchObject({
      id: 'deepseek',
      modality: 'chat',
      modelIds: ['deepseek-chat'],
      capabilities: ['stream']
    });
    expect(sdk.createDeepSeek).toHaveBeenCalledWith({
      baseURL: 'https://deepseek.test/v1',
      apiKey: 'deepseek-secret'
    });
  });

  it('healthCheck sends bearer auth and rejects non-2xx responses', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 503, statusText: 'Unavailable' }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = makeProvider();

    await expect(provider.healthCheck(SIGNAL)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://deepseek.test/v1/models', {
      method: 'GET',
      headers: { authorization: 'Bearer deepseek-secret' },
      signal: SIGNAL
    });
    const failed = provider.healthCheck(SIGNAL);
    await expect(failed).rejects.toBeInstanceOf(UpstreamHttpError);
    await expect(failed).rejects.toMatchObject({ status: 503 });
  });

  it.each([
    ['length', 'length'],
    ['content-filter', 'content_filter'],
    ['content_filter', 'content_filter'],
    ['unknown', 'stop'],
    [undefined, 'stop']
  ] as const)('maps finish reason %s to %s', async (rawReason, expectedReason) => {
    sdk.generateText.mockResolvedValue({
      text: 'answer',
      finishReason: rawReason,
      usage: { promptTokens: 4, completionTokens: 2 }
    });

    await expect(makeProvider().complete(REQUEST, SIGNAL)).resolves.toEqual({
      text: 'answer',
      finishReason: expectedReason,
      usage: { promptTokens: 4, completionTokens: 2 }
    });
  });

  it('normalizes AI SDK input/output usage and forwards request options', async () => {
    sdk.generateText.mockResolvedValue({
      text: 'answer',
      finishReason: 'stop',
      usage: { inputTokens: 7, outputTokens: 3 }
    });

    await expect(makeProvider().complete(REQUEST, SIGNAL)).resolves.toMatchObject({
      usage: { promptTokens: 7, completionTokens: 3 }
    });
    expect(sdk.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: REQUEST.messages,
        temperature: 0.2,
        topP: 0.8,
        maxOutputTokens: 128,
        stopSequences: ['END'],
        abortSignal: SIGNAL
      })
    );
  });

  it('omits usage when the SDK does not provide it', async () => {
    sdk.generateText.mockResolvedValue({ text: 'answer', finishReason: null, usage: undefined });

    await expect(makeProvider().complete(REQUEST, SIGNAL)).resolves.toEqual({
      text: 'answer',
      finishReason: 'stop',
      usage: undefined
    });
  });

  it('normalizes missing token counts to zero', async () => {
    sdk.generateText.mockResolvedValue({ text: 'answer', finishReason: 'stop', usage: {} });

    await expect(makeProvider().complete(REQUEST, SIGNAL)).resolves.toMatchObject({
      usage: { promptTokens: 0, completionTokens: 0 }
    });
  });

  it('streams deltas, normalized usage and finish in order', async () => {
    sdk.streamText.mockReturnValue({
      textStream: textStream(['a', 'b']),
      usage: Promise.resolve({ inputTokens: 5, outputTokens: 6 }),
      finishReason: Promise.resolve('content-filter')
    });

    await expect(collect(makeProvider().stream({ ...REQUEST, stream: true }, SIGNAL))).resolves.toEqual([
      { kind: 'text-delta', delta: 'a' },
      { kind: 'text-delta', delta: 'b' },
      { kind: 'usage', promptTokens: 5, completionTokens: 6 },
      { kind: 'finish', reason: 'content_filter' }
    ]);
  });

  it('finishes without a usage event when usage is absent', async () => {
    sdk.streamText.mockReturnValue({
      textStream: textStream([]),
      usage: undefined,
      finishReason: undefined
    });

    await expect(collect(makeProvider().stream({ ...REQUEST, stream: true }, SIGNAL))).resolves.toEqual([
      { kind: 'finish', reason: 'stop' }
    ]);
  });

  it('stops before emitting data when aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    sdk.streamText.mockReturnValue({
      textStream: textStream(['ignored']),
      usage: { promptTokens: 1, completionTokens: 1 },
      finishReason: 'stop'
    });

    await expect(collect(makeProvider().stream({ ...REQUEST, stream: true }, controller.signal))).resolves.toEqual([]);
  });
});
