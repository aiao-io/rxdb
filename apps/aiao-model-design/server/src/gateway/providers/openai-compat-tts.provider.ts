import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { UpstreamHttpError, ValidationError } from '../core/errors';
import type { TtsContentType, TtsProvider, TtsRequest, TtsResult } from './types';

const CONTENT_TYPE_BY_FORMAT: Record<string, TtsContentType> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  opus: 'audio/opus',
  flac: 'audio/flac'
};

export interface OpenAiCompatTtsConfig {
  baseUrl: string;
  apiKey: string;
  modelIds: readonly string[];
  capabilities: readonly string[];
}

/**
 * OpenAI 兼容协议的 TTS provider 适配器
 *
 * 上游协议：`POST <baseUrl>/v1/audio/speech`
 *   - 无 reference voice：`application/json` body `{ model, input, voice, response_format, speed }`
 *   - 有 reference voice：`multipart/form-data`（OpenAI 暂未定义，自有扩展）
 *   - 响应：二进制 `audio/mpeg|wav|opus|flac`
 *
 * 默认不声明 `reference_voice` capability；上游不支持时抛 ValidationError（FR-031）。
 */
export class OpenAiCompatTtsProvider implements TtsProvider {
  readonly #baseUrl: string;
  readonly #apiKey: string;

  readonly id = 'openai-compat-tts';
  readonly modality = 'tts' as const;
  readonly modelIds: readonly string[];
  readonly capabilities: readonly string[];

  constructor(config: OpenAiCompatTtsConfig) {
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
      // fall through
    }
    const res = await fetch(this.#baseUrl, { method: 'HEAD', signal });
    if (!res.ok && res.status !== 405) {
      throw new UpstreamHttpError(
        res.status,
        `tts provider health check failed at ${this.#baseUrl}: ${res.statusText}`
      );
    }
  }

  async synthesize(req: TtsRequest, signal: AbortSignal): Promise<TtsResult> {
    if (req.voiceReference && !this.capabilities.includes('reference_voice')) {
      throw new ValidationError(
        `provider ${this.id} does not support voice_reference; declare 'reference_voice' capability to enable`,
        { code: 'voice_reference_unsupported', param: 'voice_reference' }
      );
    }

    const url = `${this.#baseUrl}/v1/audio/speech`;
    const headers: Record<string, string> = {};
    if (this.#apiKey) headers.authorization = `Bearer ${this.#apiKey}`;

    let body: BodyInit;
    if (req.voiceReference) {
      const refBytes = await readFile(req.voiceReference.path);
      const form = new FormData();
      form.append('model', req.modelId);
      form.append('input', req.input);
      form.append('voice', req.voice);
      form.append('response_format', req.responseFormat);
      if (req.speed !== undefined) form.append('speed', String(req.speed));
      form.append(
        'voice_reference',
        new Blob([refBytes as BlobPart], {
          type: req.voiceReference.mimeType
        }),
        basename(req.voiceReference.path)
      );
      body = form;
    } else {
      headers['content-type'] = 'application/json';
      body = JSON.stringify({
        model: req.modelId,
        input: req.input,
        voice: req.voice,
        response_format: req.responseFormat,
        ...(req.speed !== undefined ? { speed: req.speed } : {})
      });
    }

    const res = await fetch(url, { method: 'POST', body, headers, signal });
    if (!res.ok) {
      const errorBody = await res.text().catch(() => '');
      throw new UpstreamHttpError(res.status, `tts upstream ${res.status}: ${errorBody || res.statusText}`);
    }
    const contentType =
      (res.headers.get('content-type') as TtsContentType | null) ??
      CONTENT_TYPE_BY_FORMAT[req.responseFormat] ??
      'audio/mpeg';
    if (!res.body) {
      throw new UpstreamHttpError(502, 'tts upstream returned empty body');
    }
    return {
      audio: res.body,
      contentType
    };
  }
}
