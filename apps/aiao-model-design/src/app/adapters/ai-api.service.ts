import { Injectable, signal } from '@angular/core';
import type { ModelGenerationOutput } from '../model-designer/types/ai-schemas';
import { AiStreamError, readAiTextDeltas, type AiApiError } from './ai-event-stream';
import { parsePartialJson } from './parse-partial-json';

export type { AiApiError } from './ai-event-stream';

/** AI 流式结果回调。 */
export interface AiStreamCallbacks<T> {
  onPartial?: (partial: T) => void;
  onComplete?: (result: T) => void | Promise<void>;
  onError?: (error: AiApiError) => void;
}

interface TextStreamCallbacks {
  onDelta?: (delta: string, fullText: string) => void | Promise<void>;
  onComplete?: (fullText: string) => void | Promise<void>;
  onError?: (error: AiApiError) => void;
}

/** 通过 POST SSE 消费模型生成和迭代接口。 */
@Injectable({ providedIn: 'root' })
export class AiApiService {
  #activeAbortController: AbortController | null = null;

  /** 当前是否有进行中的 AI 请求。 */
  readonly isStreaming = signal(false);

  /** 增量输出模型 JSON 文本和部分对象，完成后返回完整模型。 */
  async generate(
    prompt: string,
    existingModel?: { entityNames: string[]; entities?: unknown[] },
    callbacks?: AiStreamCallbacks<ModelGenerationOutput> & { onTextChunk?: (chunk: string) => void }
  ): Promise<void> {
    await this.#streamText(
      '/api/ai/model/generate',
      { prompt, existingModel },
      {
        onDelta: async (chunk, fullText) => {
          callbacks?.onTextChunk?.(chunk);
          if (!callbacks?.onPartial) return;
          const { value } = await parsePartialJson(fullText);
          if (value !== undefined) callbacks.onPartial(value as unknown as ModelGenerationOutput);
        },
        onComplete: async fullText => {
          const result = JSON.parse(fullText) as ModelGenerationOutput;
          await callbacks?.onComplete?.(result);
        },
        onError: callbacks?.onError
      }
    );
  }

  /** 增量输出对话片段和累计文本。 */
  async chat(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    modelContext: { entityNames: string[]; selectedEntity?: unknown; relatedEntities?: unknown[] },
    callbacks?: {
      onPartial?: (text: string) => void;
      onChunk?: (text: string) => void;
      onComplete?: (fullText: string) => void;
      onError?: (error: AiApiError | Error) => void;
    }
  ): Promise<void> {
    await this.#streamText(
      '/api/ai/model/chat',
      { messages, modelContext },
      {
        onDelta: (chunk, fullText) => {
          callbacks?.onChunk?.(chunk);
          callbacks?.onPartial?.(fullText);
        },
        onComplete: callbacks?.onComplete,
        onError: callbacks?.onError
      }
    );
  }

  /** 取消正在读取的 SSE 请求。 */
  abort(): void {
    this.#activeAbortController?.abort();
  }

  async #streamText(url: string, body: unknown, callbacks: TextStreamCallbacks): Promise<void> {
    this.isStreaming.set(true);
    const abortController = new AbortController();
    this.#activeAbortController = abortController;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify(body),
        signal: abortController.signal,
        credentials: 'include'
      });
      if (!response.ok) {
        callbacks.onError?.(this.#classifyError(response.status));
        return;
      }
      let fullText = '';
      for await (const chunk of readAiTextDeltas(response)) {
        fullText += chunk;
        await callbacks.onDelta?.(chunk, fullText);
      }
      await callbacks.onComplete?.(fullText);
    } catch (error) {
      callbacks.onError?.(this.#classifyStreamError(error));
    } finally {
      this.#activeAbortController = null;
      this.isStreaming.set(false);
    }
  }

  #classifyError(status: number): AiApiError {
    if (status === 400) return { type: 'validation', status, message: 'Invalid parameters' };
    if (status === 401) return { type: 'unauthorized', status, message: 'Authentication expired' };
    if (status === 429) return { type: 'rate-limit', status, message: 'Rate limited, please retry later' };
    if (status === 408 || status === 504) return { type: 'timeout', status, message: 'Request timed out' };
    return { type: 'server', status, message: `Server error (${status})` };
  }

  #classifyStreamError(error: unknown): AiApiError {
    if (error instanceof AiStreamError) return error.detail;
    if (error instanceof SyntaxError) return { type: 'server', message: 'Invalid model response' };
    if (error instanceof Error && error.name === 'TimeoutError')
      return { type: 'timeout', message: 'Request timed out' };
    if (error instanceof Error && error.name === 'AbortError') return { type: 'network', message: 'AbortError' };
    return { type: 'network', message: error instanceof Error ? error.message : 'Network error' };
  }
}
