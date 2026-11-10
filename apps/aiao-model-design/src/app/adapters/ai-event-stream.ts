import { EventSourceParserStream } from 'eventsource-parser/stream';

const API_ERROR_TYPES = ['validation', 'unauthorized', 'rate-limit', 'server', 'network', 'timeout'] as const;
type ApiErrorType = (typeof API_ERROR_TYPES)[number];

type StreamChunk = { type: string; delta?: string; errorText?: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseStreamChunk(data: string): StreamChunk {
  const value: unknown = JSON.parse(data);
  if (!isRecord(value) || typeof value['type'] !== 'string') throw new SyntaxError('Invalid AI stream event');
  if (value['delta'] !== undefined && typeof value['delta'] !== 'string') {
    throw new SyntaxError('Invalid AI stream event');
  }
  if (value['errorText'] !== undefined && typeof value['errorText'] !== 'string') {
    throw new SyntaxError('Invalid AI stream event');
  }
  return value as StreamChunk;
}

function parseApiError(value: unknown): AiApiError {
  if (!isRecord(value)) throw new SyntaxError('Invalid AI stream event');
  const type = value['type'];
  const status = value['status'];
  const message = value['message'];
  if (
    typeof type !== 'string' ||
    !(API_ERROR_TYPES as readonly string[]).includes(type) ||
    (status !== undefined && typeof status !== 'number') ||
    typeof message !== 'string'
  ) {
    throw new SyntaxError('Invalid AI stream event');
  }
  if (status === undefined) return { type: type as ApiErrorType, message };
  return { type: type as ApiErrorType, status, message };
}

const STREAM_FINISHED = Symbol('stream-finished');

/** AI API 的 HTTP 和流内错误分类。 */
export type AiApiError = { type: ApiErrorType; status?: number; message: string };

/** 保留 SSE 错误事件的分类、状态码与安全消息。 */
export class AiStreamError extends Error {
  constructor(readonly detail: AiApiError) {
    super(detail.message);
  }
}

function readDelta(data: string): string | typeof STREAM_FINISHED | undefined {
  const chunk = parseStreamChunk(data);
  if (chunk.type === 'finish') return STREAM_FINISHED;
  if (chunk.type === 'error') throw new AiStreamError(parseApiError(JSON.parse(chunk.errorText ?? '')));
  if (chunk.type === 'abort') throw new DOMException('AbortError', 'AbortError');
  if (chunk.type === 'text-delta') {
    if (chunk.delta === undefined) throw new SyntaxError('Invalid AI stream event');
    return chunk.delta;
  }
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
    if (error instanceof SyntaxError) throw new AiStreamError({ type: 'server', message: 'Invalid AI stream event' });
    throw error;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
