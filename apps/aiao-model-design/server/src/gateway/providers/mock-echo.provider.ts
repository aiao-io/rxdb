import { TimeoutError, UpstreamHttpError, ValidationError } from '../core/errors';
import type { ChatComplete, ChatProvider, ChatRequest, ChatStreamEvent } from './types';

/**
 * Mock Echo chat provider — 测试 / SC-004 验收专用
 *
 * **正常行为**：把最后一条 user message 的 content 按 char 一次一个 yield 回去（流式）
 * 或直接返回拼接结果（非流式）。
 *
 * **行为注入 marker（T039 修订；仅在 NODE_ENV !== 'production' 生效）**：
 *
 * 首条 user message `content` 严格等于以下 marker 时分别抛对应错误，
 * 用于驱动 T034 / T101 等错误注入用例：
 *
 * | marker | 抛出错误 |
 * | --- | --- |
 * | `inject-5xx` | `UpstreamHttpError(status=500)` |
 * | `inject-rate-limit` | `UpstreamHttpError(status=429)` |
 * | `inject-upstream-auth` | `UpstreamHttpError(status=401)` (上游 API key 错) |
 * | `inject-timeout` | `TimeoutError('total')` |
 * | `inject-validation` | `ValidationError(code='mock_inject')` |
 *
 * Marker 触发后既阻断 stream() 也阻断 complete()。匹配是精确字符串相等，避免误伤。
 */
export class MockEchoProvider implements ChatProvider {
  readonly id = 'mock-echo';
  readonly modality = 'chat' as const;
  readonly modelIds: readonly string[];
  readonly capabilities: readonly string[];

  constructor(
    config: {
      modelIds?: readonly string[];
      capabilities?: readonly string[];
    } = {}
  ) {
    this.modelIds = config.modelIds ?? ['mock-echo-1'];
    this.capabilities = config.capabilities ?? ['stream'];
  }

  async healthCheck(): Promise<void> {
    return;
  }

  async complete(req: ChatRequest, _signal: AbortSignal): Promise<ChatComplete> {
    this.#checkMarker(req);
    const text = this.#extractEchoText(req);
    return {
      text,
      finishReason: 'stop',
      usage: { promptTokens: text.length, completionTokens: text.length }
    };
  }

  async *stream(req: ChatRequest, signal: AbortSignal): AsyncIterable<ChatStreamEvent> {
    this.#checkMarker(req);
    const text = this.#extractEchoText(req);
    for (const char of text) {
      if (signal.aborted) return;
      yield { kind: 'text-delta', delta: char };
    }
    yield {
      kind: 'usage',
      promptTokens: text.length,
      completionTokens: text.length
    };
    yield { kind: 'finish', reason: 'stop' };
  }

  #extractEchoText(req: ChatRequest): string {
    const lastUser = [...req.messages].reverse().find(m => m.role === 'user');
    return lastUser?.content ?? '';
  }

  #checkMarker(req: ChatRequest): void {
    if (process.env.NODE_ENV === 'production') return;
    const firstUser = req.messages.find(m => m.role === 'user');
    if (!firstUser) return;
    const content = firstUser.content.trim();
    switch (content) {
      case 'inject-5xx':
        throw new UpstreamHttpError(500, 'mock-echo inject-5xx');
      case 'inject-rate-limit':
        throw new UpstreamHttpError(429, 'mock-echo inject-rate-limit');
      case 'inject-upstream-auth':
        throw new UpstreamHttpError(401, 'mock-echo inject-upstream-auth');
      case 'inject-timeout':
        throw new TimeoutError('total', 'mock-echo inject-timeout');
      case 'inject-validation':
        throw new ValidationError('mock-echo inject-validation', {
          code: 'mock_inject'
        });
      default:
        return;
    }
  }
}
