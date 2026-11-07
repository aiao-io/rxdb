import { StructuredObject } from '@ai-sdk/angular';
import type { ModelGenerationOutput } from '../model-designer/types/ai-schemas';
import { effect, inject, Injectable, Injector, signal } from '@angular/core';
import { jsonSchema } from 'ai';

/** AI SDK 流事件回调 */
export interface AiStreamCallbacks<T> {
  onPartial?: (partial: T) => void;
  onComplete?: (result: T) => void | Promise<void>;
  onError?: (error: AiApiError) => void;
}

/** AI API 错误分类 */
export interface AiApiError {
  type: 'validation' | 'unauthorized' | 'rate-limit' | 'server' | 'network' | 'timeout';
  status?: number;
  message: string;
}

/**
 * AI API 调用服务
 *
 * 封装 POST /api/ai/model/generate、/validate、/chat 三个流式端点。
 * generate/validate 使用 @ai-sdk/angular StructuredObject 消费 streamObject 文本流；
 * chat 使用 fetch 消费 streamText data stream（AI SDK 私有协议，非 SSE）。
 */
@Injectable({ providedIn: 'root' })
export class AiApiService {
  readonly #injector = inject(Injector);
  readonly #activeObject = signal<{ stop(): void } | null>(null);
  #activeAbortController: AbortController | null = null;

  /** 当前是否有进行中的 AI 请求 */
  readonly isStreaming = signal(false);

  /**
   * 调用模型生成 SSE 端点
   *
   * 当提供 onTextChunk 回调时，使用原始文本流（供 StreamingEntityParser 逐步解析）。
   * 否则回退到 StructuredObject 模式。
   */
  async generate(
    prompt: string,
    existingModel?: { entityNames: string[]; entities?: unknown[] },
    callbacks?: AiStreamCallbacks<ModelGenerationOutput> & { onTextChunk?: (chunk: string) => void }
  ): Promise<void> {
    if (callbacks?.onTextChunk) {
      await this.#streamRawText('/api/ai/model/generate', { prompt, existingModel }, callbacks);
    } else {
      await this.#streamObject<ModelGenerationOutput>('/api/ai/model/generate', { prompt, existingModel }, callbacks);
    }
  }

  /**
   * 调用对话式迭代 SSE 端点
   */
  async chat(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    modelContext: { entityNames: string[]; selectedEntity?: unknown; relatedEntities?: unknown[] },
    callbacks?: {
      /** 包内 AiApiAdapter 契约（逐块完整文本） */
      onPartial?: (text: string) => void;
      /** 遗留 drawer 契约：text delta 片段 */
      onChunk?: (text: string) => void;
      onComplete?: (fullText: string) => void;
      onError?: (error: AiApiError | Error) => void;
    }
  ): Promise<void> {
    this.isStreaming.set(true);

    const abortController = new AbortController();
    this.#activeAbortController = abortController;

    try {
      const response = await fetch('/api/ai/model/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, modelContext }),
        signal: abortController.signal,
        credentials: 'include'
      });

      if (!response.ok) {
        callbacks?.onError?.(this.#classifyError(response.status));
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        // AI SDK data stream 格式：每行为 `0:"text"\n`，前缀 `0:` 表示 text delta
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('0:')) continue;
          try {
            const text = JSON.parse(line.slice(2)) as string;
            fullText += text;
            callbacks?.onChunk?.(text);
            callbacks?.onPartial?.(fullText);
          } catch {
            // 忽略非 text delta 行（finish_reason 等）
          }
        }
      }

      callbacks?.onComplete?.(fullText);
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        callbacks?.onError?.({ type: 'network', message: 'AbortError' });
        return;
      }
      callbacks?.onError?.(this.#classifyNetworkError(e as Error));
    } finally {
      this.#activeAbortController = null;
      this.isStreaming.set(false);
    }
  }

  /** 取消当前进行中的请求 */
  abort() {
    this.#activeObject()?.stop();
    this.#activeAbortController?.abort();
    this.#activeAbortController = null;
  }

  /**
   * 原始文本流模式：直接读取响应文本块
   *
   * 供 StreamingEntityParser 逐步解析 JSON 实体。
   * 服务端 streamObject().toTextStreamResponse() 返回渐进式 JSON 文本流。
   */
  async #streamRawText<T>(
    url: string,
    body: unknown,
    callbacks: AiStreamCallbacks<T> & { onTextChunk?: (chunk: string) => void }
  ): Promise<void> {
    this.isStreaming.set(true);
    const abortController = new AbortController();
    this.#activeAbortController = abortController;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: abortController.signal,
        credentials: 'include'
      });

      if (!response.ok) {
        callbacks.onError?.(this.#classifyError(response.status));
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;
        callbacks.onTextChunk?.(chunk);
      }

      try {
        const result = JSON.parse(fullText) as T;
        await callbacks.onComplete?.(result);
      } catch {
        // JSON 可能不完整（AI 中断），仍触发 onComplete 让 parser 补全
        await callbacks.onComplete?.({} as T);
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        callbacks.onError?.({ type: 'network', message: 'AbortError' });
        return;
      }
      callbacks.onError?.(this.#classifyNetworkError(e as Error));
    } finally {
      this.#activeAbortController = null;
      this.isStreaming.set(false);
    }
  }

  /**
   * 使用 @ai-sdk/angular StructuredObject 消费 AI SDK 文本流
   *
   * 服务端通过 streamObject().toTextStreamResponse() 返回 Content-Type: text/plain
   * 的渐进式 JSON 文本流（非 SSE），StructuredObject 内部使用 parsePartialJson
   * 解析并更新 Angular signal。
   */
  async #streamObject<T>(url: string, body: unknown, callbacks?: AiStreamCallbacks<T>): Promise<void> {
    this.isStreaming.set(true);

    const so = new StructuredObject({
      api: url,
      schema: jsonSchema<T>({ type: 'object' }),
      credentials: 'include',
      onFinish: async ({ object }) => {
        if (object) {
          await callbacks?.onComplete?.(object as T);
        }
      },
      onError: error => {
        callbacks?.onError?.(this.#classifyNetworkError(error));
      }
    });

    this.#activeObject.set(so);

    const effectRef = effect(
      () => {
        const obj = so.object;
        if (obj) callbacks?.onPartial?.(obj as T);
      },
      { injector: this.#injector }
    );

    try {
      await so.submit(body);
      // onFinish 未触发时的兜底（schema 验证失败但对象已存在）
      if (so.object && so.error) {
        await callbacks?.onComplete?.(so.object as T);
      } else if (!so.object && so.error) {
        callbacks?.onError?.(this.#classifyNetworkError(so.error));
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        callbacks?.onError?.(this.#classifyNetworkError(e as Error));
      }
    } finally {
      effectRef.destroy();
      this.isStreaming.set(false);
      this.#activeObject.set(null);
    }
  }

  #classifyError(status: number): AiApiError {
    if (status === 400) return { type: 'validation', status, message: 'Invalid parameters' };
    if (status === 401) return { type: 'unauthorized', status, message: 'Authentication expired' };
    if (status === 429) return { type: 'rate-limit', status, message: 'Rate limited, please retry later' };
    if (status === 408 || status === 504) return { type: 'timeout', status, message: 'Request timed out' };
    return { type: 'server', status, message: `Server error (${status})` };
  }

  #classifyNetworkError(error: Error): AiApiError {
    if (error.name === 'TimeoutError') return { type: 'timeout', message: 'Request timed out' };
    return { type: 'network', message: error.message || 'Network error' };
  }
}
