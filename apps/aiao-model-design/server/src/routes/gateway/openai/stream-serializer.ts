import { classifyError } from '../../../gateway/core/error-classifier';
import { closeStream, writeData, writeRaw } from '../../../gateway/core/sse-writer';
import type { RequestContext } from '../../../gateway/core/types';
import type { ChatStreamEvent } from '../../../gateway/providers/types';
import { mapGatewayErrorToOpenAi } from './error-mapper';

interface ChatChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: { role?: 'assistant'; content?: string };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

const buildDeltaChunk = (
  id: string,
  model: string,
  created: number,
  delta: { role?: 'assistant'; content?: string },
  finishReason: string | null
): ChatChunk => ({
  id,
  object: 'chat.completion.chunk',
  created,
  model,
  choices: [{ index: 0, delta, finish_reason: finishReason }]
});

const buildUsageChunk = (
  id: string,
  model: string,
  created: number,
  usage: { promptTokens: number; completionTokens: number }
): ChatChunk => ({
  id,
  object: 'chat.completion.chunk',
  created,
  model,
  choices: [],
  usage: {
    prompt_tokens: usage.promptTokens,
    completion_tokens: usage.completionTokens,
    total_tokens: usage.promptTokens + usage.completionTokens
  }
});

export interface SerializeOpenAiStreamOptions {
  source: AsyncIterable<ChatStreamEvent>;
  modelId: string;
  ctx: RequestContext;
  /** OpenAI `stream_options.include_usage` 透传 */
  includeUsage?: boolean;
}

/**
 * 把 ChatStreamEvent 流序列化为 OpenAI SSE 字节流
 *
 * - 正常结束写 `data: [DONE]\n\n`
 * - 流内异常按 FR-007 写一条 `data: {error: ...}\n\n` 后立即关闭，**不**再 [DONE]
 * - `includeUsage: true` 时在 finish chunk 后追加一条 usage chunk（OpenAI stream_options）
 *
 * 字节级输出契约：
 *   data: {"id":"chatcmpl-<traceId>","object":"chat.completion.chunk","created":N,
 *          "model":"<modelId>","choices":[{"index":0,"delta":{"content":"x"},"finish_reason":null}]}\n\n
 *   ... 重复 N 次 ...
 *   data: {"id":"chatcmpl-<traceId>","object":"chat.completion.chunk","created":N,
 *          "model":"<modelId>","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n
 *   data: [DONE]\n\n
 */
export function serializeOpenAiChatStream(opts: SerializeOpenAiStreamOptions): ReadableStream<Uint8Array> {
  const id = `chatcmpl-${opts.ctx.traceId}`;
  const created = Math.floor(opts.ctx.requestedAt / 1000);
  let lastUsage: { promptTokens: number; completionTokens: number } | null = null;
  let firstChunk = true;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const evt of opts.source) {
          if (evt.kind === 'text-delta') {
            const delta: { role?: 'assistant'; content: string } = {
              content: evt.delta
            };
            if (firstChunk) {
              delta.role = 'assistant';
              firstChunk = false;
            }
            writeData(controller, buildDeltaChunk(id, opts.modelId, created, delta, null));
          } else if (evt.kind === 'usage') {
            lastUsage = {
              promptTokens: evt.promptTokens,
              completionTokens: evt.completionTokens
            };
          } else if (evt.kind === 'finish') {
            writeData(controller, buildDeltaChunk(id, opts.modelId, created, {}, evt.reason));
            if (opts.includeUsage && lastUsage) {
              writeData(controller, buildUsageChunk(id, opts.modelId, created, lastUsage));
            }
          }
        }
        writeRaw(controller, 'data: [DONE]\n\n');
      } catch (err) {
        const gwErr = classifyError(err, opts.ctx);
        if (gwErr) {
          writeData(controller, { error: mapGatewayErrorToOpenAi(gwErr) });
        }
      } finally {
        closeStream(controller);
      }
    }
  });
}
