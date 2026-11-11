import { Injectable, signal } from '@angular/core';
import type { ModelGenerationOutput } from '../model-designer/types/ai-schemas';
import { AiStreamError, readAiTextDeltas, type AiApiError } from './ai-event-stream';
import { parsePartialJson } from './parse-partial-json';

export type { AiApiError } from './ai-event-stream';

/** AI 流式结果回调。 */
export interface AiStreamCallbacks<T> {
  onPartial?: (partial: T) => void;
  onComplete?: (result: T) => void | Promise<void>;
  onError?: (error: AiApiError) => void | Promise<void>;
}

export interface AiChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiChatModelContext {
  entityNames: string[];
  selectedEntity?: unknown;
  relatedEntities?: unknown[];
}

export interface AiChatCallbacks {
  onPartial?: (text: string) => void;
  onChunk?: (text: string) => void;
  onComplete?: (fullText: string) => void | Promise<void>;
  onError?: (error: AiApiError) => void | Promise<void>;
}

interface TextStreamCallbacks {
  onDelta?: (delta: string, fullText: string) => void | Promise<void>;
  onComplete?: (fullText: string) => void | Promise<void>;
  onError?: (error: AiApiError) => void | Promise<void>;
}

interface ActiveRequest {
  controller: AbortController;
}

/** 通过 POST SSE 消费模型生成和迭代接口。 */
@Injectable({ providedIn: 'root' })
export class AiApiService {
  #activeRequest: ActiveRequest | null = null;

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
    messages: AiChatMessage[],
    modelContext?: AiChatModelContext,
    callbacks?: AiChatCallbacks
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
    this.#activeRequest?.controller.abort();
  }

  async #streamText(url: string, body: unknown, callbacks: TextStreamCallbacks): Promise<void> {
    const previousRequest = this.#activeRequest;
    const activeRequest: ActiveRequest = { controller: new AbortController() };
    this.#activeRequest = activeRequest;
    this.isStreaming.set(true);

    // 新请求接管取消句柄；旧请求的 finally 不能再覆盖新请求状态。
    previousRequest?.controller.abort();

    try {
      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
          body: JSON.stringify(body),
          signal: activeRequest.controller.signal,
          credentials: 'include'
        });
      } catch (error) {
        await callbacks.onError?.(this.#classifyStreamError(error));
        return;
      }

      if (!response.ok) {
        await callbacks.onError?.(this.#classifyError(response.status));
        return;
      }

      try {
        let fullText = '';
        for await (const chunk of readAiTextDeltas(response)) {
          fullText += chunk;
          await callbacks.onDelta?.(chunk, fullText);
        }
        await callbacks.onComplete?.(fullText);
      } catch (error) {
        await callbacks.onError?.(this.#classifyStreamError(error));
      }
    } finally {
      if (this.#activeRequest === activeRequest) {
        this.#activeRequest = null;
        this.isStreaming.set(false);
      }
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
