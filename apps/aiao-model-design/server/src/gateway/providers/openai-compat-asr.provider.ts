import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { UpstreamHttpError } from '../core/errors';
import type { AsrProvider, AsrRequest, AsrResult } from './types';

const FALLBACK_MIME = 'audio/wav';

export interface OpenAiCompatAsrConfig {
  baseUrl: string;
  apiKey: string;
  modelIds: readonly string[];
  capabilities: readonly string[];
}

/**
 * OpenAI 兼容协议的 ASR provider 适配器
 *
 * 上游协议：`POST <baseUrl>/v1/audio/transcriptions` multipart/form-data
 *   字段：file / model / language? / prompt? / response_format? / temperature?
 *   响应：`response_format='json'` → `{ text }`，`'verbose_json'` → `{ text, segments, language, duration }`
 *
 * 适用于：自托管 sherpa-onnx（FastAPI 包一层）、OpenAI 云、阿里云 ASR 等任何 OpenAI 协议兼容服务。
 *
 * 不在 provider 内做错误分类；上游 4xx/5xx 包装为 `UpstreamHttpError` 抛给内核 error-classifier。
 */
export class OpenAiCompatAsrProvider implements AsrProvider {
  readonly #baseUrl: string;
  readonly #apiKey: string;

  readonly id = 'openai-compat-asr';
  readonly modality = 'asr' as const;
  readonly modelIds: readonly string[];
  readonly capabilities: readonly string[];

  constructor(config: OpenAiCompatAsrConfig) {
    this.modelIds = config.modelIds;
    this.capabilities = config.capabilities;
    this.#baseUrl = config.baseUrl.replace(/\/$/, '');
    this.#apiKey = config.apiKey;
  }

  async healthCheck(signal: AbortSignal): Promise<void> {
    try {
      const res = await fetch(`${this.#baseUrl}/healthz`, {
        method: 'GET',
        signal
      });
      if (res.ok) return;
    } catch {
      // fall through to HEAD baseUrl
    }
    const res = await fetch(this.#baseUrl, { method: 'HEAD', signal });
    if (!res.ok && res.status !== 405) {
      throw new UpstreamHttpError(
        res.status,
        `asr provider health check failed at ${this.#baseUrl}: ${res.statusText}`
      );
    }
  }

  async transcribe(req: AsrRequest, signal: AbortSignal): Promise<AsrResult> {
    const audioBytes = await readFile(req.audio.path);
    const audioBlob = new Blob([audioBytes as BlobPart], {
      type: req.audio.mimeType || FALLBACK_MIME
    });
    const form = new FormData();
    form.append('file', audioBlob, basename(req.audio.path));
    form.append('model', req.modelId);
    if (req.language) form.append('language', req.language);
    if (req.prompt) form.append('prompt', req.prompt);
    if (req.responseFormat) form.append('response_format', req.responseFormat);
    if (req.temperature !== undefined) {
      form.append('temperature', String(req.temperature));
    }

    const headers: Record<string, string> = {};
    if (this.#apiKey) headers.authorization = `Bearer ${this.#apiKey}`;

    const url = `${this.#baseUrl}/v1/audio/transcriptions`;
    const res = await fetch(url, {
      method: 'POST',
      body: form,
      headers,
      signal
    });
    if (!res.ok) {
      const errorBody = await res.text().catch(() => '');
      throw new UpstreamHttpError(res.status, `asr upstream ${res.status}: ${errorBody || res.statusText}`);
    }
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const data = (await res.json()) as Partial<AsrResult>;
      return {
        text: data.text ?? '',
        segments: data.segments,
        language: data.language,
        duration: data.duration
      };
    }
    // 'text' / 'srt' / 'vtt' response_format 返回纯文本
    const text = await res.text();
    return { text };
  }
}
