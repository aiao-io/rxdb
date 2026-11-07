import { createDeepSeek } from '@ai-sdk/deepseek';
import { generateText, streamText } from 'ai';
import { UpstreamHttpError } from '../core/errors';
import type { ChatComplete, ChatProvider, ChatRequest, ChatStreamEvent, FinishReason } from './types';

const mapFinishReason = (reason: string | undefined | null): FinishReason => {
  if (!reason) return 'stop';
  if (reason === 'length') return 'length';
  if (reason === 'content-filter' || reason === 'content_filter') {
    return 'content_filter';
  }
  return 'stop';
};

interface RawUsage {
  promptTokens?: number;
  completionTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
}

const normalizeUsage = (raw: RawUsage | undefined): { promptTokens: number; completionTokens: number } | undefined => {
  if (!raw) return undefined;
  const promptTokens = raw.promptTokens ?? raw.inputTokens ?? 0;
  const completionTokens = raw.completionTokens ?? raw.outputTokens ?? 0;
  return { promptTokens, completionTokens };
};

export interface DeepSeekChatProviderConfig {
  baseUrl: string;
  apiKey: string;
  modelIds: readonly string[];
  capabilities: readonly string[];
}

/**
 * DeepSeek chat provider — 包 `@ai-sdk/deepseek` 适配到内核 `ChatProvider` 接口
 *
 * - `healthCheck`：探 `<baseUrl>/v1/models`（OpenAI 兼容元数据请求）
 * - `complete` / `stream`：用 AI SDK 6 `generateText` / `streamText`
 * - 不在 provider 内做错误分类；由 `error-classifier` 统一处理
 */
export class DeepSeekChatProvider implements ChatProvider {
  readonly #baseUrl: string;
  readonly #apiKey: string;
  readonly #client: ReturnType<typeof createDeepSeek>;

  readonly id = 'deepseek';
  readonly modality = 'chat' as const;
  readonly modelIds: readonly string[];
  readonly capabilities: readonly string[];

  constructor(config: DeepSeekChatProviderConfig) {
    this.modelIds = config.modelIds;
    this.capabilities = config.capabilities;
    this.#baseUrl = config.baseUrl;
    this.#apiKey = config.apiKey;
    this.#client = createDeepSeek({
      baseURL: `${config.baseUrl}/v1`,
      apiKey: config.apiKey
    });
  }

  async healthCheck(signal: AbortSignal): Promise<void> {
    const url = `${this.#baseUrl}/v1/models`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { authorization: `Bearer ${this.#apiKey}` },
      signal
    });
    if (!res.ok) {
      throw new UpstreamHttpError(res.status, `deepseek health check failed at ${url}: ${res.statusText}`);
    }
  }

  async complete(req: ChatRequest, signal: AbortSignal): Promise<ChatComplete> {
    const result = await generateText({
      model: this.#client(req.modelId),
      messages: req.messages.map(m => ({ role: m.role, content: m.content })),
      temperature: req.temperature,
      topP: req.topP,
      maxOutputTokens: req.maxTokens,
      stopSequences: req.stop,
      abortSignal: signal
    } as Parameters<typeof generateText>[0]);
    return {
      text: result.text,
      finishReason: mapFinishReason(result.finishReason as string),
      usage: normalizeUsage(result.usage as RawUsage)
    };
  }

  async *stream(req: ChatRequest, signal: AbortSignal): AsyncIterable<ChatStreamEvent> {
    const result = streamText({
      model: this.#client(req.modelId),
      messages: req.messages.map(m => ({ role: m.role, content: m.content })),
      temperature: req.temperature,
      topP: req.topP,
      maxOutputTokens: req.maxTokens,
      stopSequences: req.stop,
      abortSignal: signal
    } as Parameters<typeof streamText>[0]);
    for await (const delta of result.textStream) {
      if (signal.aborted) return;
      yield { kind: 'text-delta', delta };
    }
    const [rawUsage, rawFinish] = await Promise.all([
      Promise.resolve(result.usage as unknown as RawUsage | undefined),
      Promise.resolve(result.finishReason as unknown as string | undefined)
    ]);
    const usage = normalizeUsage(rawUsage);
    if (usage) yield { kind: 'usage', ...usage };
    yield { kind: 'finish', reason: mapFinishReason(rawFinish) };
  }
}
