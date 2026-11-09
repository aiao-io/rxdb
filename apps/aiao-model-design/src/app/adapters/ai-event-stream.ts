import { EventSourceParserStream } from 'eventsource-parser/stream';
import { z } from 'zod';

const ApiErrorSchema = z.object({
  type: z.enum(['validation', 'unauthorized', 'rate-limit', 'server', 'network', 'timeout']),
  status: z.number().optional(),
  message: z.string()
});

const StreamChunkSchema = z.object({
  type: z.string(),
  delta: z.string().optional(),
  errorText: z.string().optional()
});

const STREAM_FINISHED = Symbol('stream-finished');

/** AI API 的 HTTP 和流内错误分类。 */
export type AiApiError = z.infer<typeof ApiErrorSchema>;

/** 保留 SSE 错误事件的分类、状态码与安全消息。 */
export class AiStreamError extends Error {
  constructor(readonly detail: AiApiError) {
    super(detail.message);
  }
}

function readDelta(data: string): string | typeof STREAM_FINISHED | undefined {
  const chunk = StreamChunkSchema.parse(JSON.parse(data));
  if (chunk.type === 'finish') return STREAM_FINISHED;
  if (chunk.type === 'error')
    throw new AiStreamError(ApiErrorSchema.parse(JSON.parse(z.string().parse(chunk.errorText))));
  if (chunk.type === 'abort') throw new DOMException('AbortError', 'AbortError');
  if (chunk.type === 'text-delta') return z.string().parse(chunk.delta);
  return undefined;
}

/** 按 SSE 事件读取文本，要求显式结束标志，支持任意网络分块。 */
export async function* readAiTextDeltas(response: Response): AsyncGenerator<string> {
  const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (contentType !== 'text/event-stream' || !response.body)
    throw new AiStreamError({ type: 'server', message: 'Expected an AI event stream' });
  const reader = response.body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new EventSourceParserStream())
    .getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) throw new AiStreamError({ type: 'network', message: 'AI stream ended before completion' });
      if (value.data === '[DONE]') return;
      const delta = readDelta(value.data);
      if (delta === STREAM_FINISHED) return;
      if (delta !== undefined) yield delta;
    }
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      throw new AiStreamError({ type: 'server', message: 'Invalid AI stream event' });
    throw error;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
