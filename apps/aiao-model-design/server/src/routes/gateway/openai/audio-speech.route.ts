import { Elysia } from 'elysia';
import { ModelNotFoundError, ValidationError } from '../../../gateway/core/errors';
import { createRequestContext } from '../../../gateway/core/request-context';
import { X_TRACE_ID_HEADER, setTraceHeader } from '../../../gateway/core/trace-header';
import type { TtsAudioFormat, TtsProvider, TtsRequest } from '../../../gateway/providers/types';
import type { GatewayDeps } from '../index';

/** FR-030 输入文本上限 4096 字符 */
const MAX_INPUT_CHARS = 4096;

const VALID_FORMATS = new Set<TtsAudioFormat>(['mp3', 'wav', 'opus', 'flac']);

interface ParsedSynthesisInput {
  model: string;
  input: string;
  voice: string;
  responseFormat: TtsAudioFormat;
  speed?: number;
  voiceReference?: File;
}

const parseAudioFormat = (raw: unknown): TtsAudioFormat => {
  if (raw === undefined || raw === null || raw === '') return 'mp3';
  if (typeof raw === 'string' && VALID_FORMATS.has(raw as TtsAudioFormat)) {
    return raw as TtsAudioFormat;
  }
  throw new ValidationError(
    `unsupported response_format "${String(raw)}"; allowed: ${[...VALID_FORMATS].join(' | ')}`,
    { code: 'invalid_response_format', param: 'response_format' }
  );
};

const parseSpeed = (raw: unknown): number | undefined => {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) {
    throw new ValidationError(`speed must be a number, got "${String(raw)}"`, {
      code: 'invalid_speed',
      param: 'speed'
    });
  }
  return n;
};

const requireString = (raw: unknown, field: string): string => {
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new ValidationError(`field "${field}" missing or empty`, {
      code: 'invalid_request_body',
      param: field
    });
  }
  return raw;
};

const parseJsonBody = (raw: unknown): ParsedSynthesisInput => {
  const o = raw as Record<string, unknown>;
  if (!o || typeof o !== 'object') {
    throw new ValidationError('request body must be a JSON object', {
      code: 'invalid_request_body'
    });
  }
  return {
    model: requireString(o.model, 'model'),
    input: requireString(o.input, 'input'),
    voice: requireString(o.voice, 'voice'),
    responseFormat: parseAudioFormat(o.response_format),
    speed: parseSpeed(o.speed)
  };
};

const parseMultipartBody = (form: FormData): ParsedSynthesisInput => {
  return {
    model: requireString(form.get('model'), 'model'),
    input: requireString(form.get('input'), 'input'),
    voice: requireString(form.get('voice'), 'voice'),
    responseFormat: parseAudioFormat(form.get('response_format')),
    speed: parseSpeed(form.get('speed')),
    voiceReference: (form.get('voice_reference') as File | null) ?? undefined
  };
};

const inferRefExt = (filename: string | undefined, mime: string): string => {
  if (filename) {
    const dot = filename.lastIndexOf('.');
    if (dot > 0) {
      const ext = filename.slice(dot + 1).toLowerCase();
      if (/^[a-z0-9]+$/.test(ext) && ext.length <= 8) return ext;
    }
  }
  const m = mime.toLowerCase();
  if (m.includes('wav')) return 'wav';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  if (m.includes('webm')) return 'webm';
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('flac')) return 'flac';
  return 'bin';
};

const resolveTtsProvider = (modelId: string, deps: GatewayDeps): { provider: TtsProvider; providerId: string } => {
  const entry = deps.modelRegistry.byId.get(modelId);
  if (!entry) throw new ModelNotFoundError(modelId);
  if (entry.modality !== 'tts') {
    throw new ValidationError(`model "${modelId}" is registered as ${entry.modality}, not tts`, {
      code: 'invalid_model_for_endpoint',
      param: 'model'
    });
  }
  const provider = deps.providerRegistry.providers.get(entry.providerId);
  if (!provider || provider.modality !== 'tts') {
    throw new ModelNotFoundError(modelId);
  }
  return { provider: provider as TtsProvider, providerId: entry.providerId };
};

/**
 * 构造 POST /v1/audio/speech 路由（OpenAI 兼容 / T078）
 *
 * 按 Content-Type 分发：
 * - `application/json` → 普通 TTS（JSON body）
 * - `multipart/form-data` → 含 voice_reference 文件（落盘后传给 provider）
 *
 * 校验：
 * - input 4096 字符上限（FR-030）→ 422 `text_too_long`
 * - response_format 必须 ∈ {mp3, wav, opus, flac}
 * - voice_reference 时 provider 必须声明 `reference_voice` capability（FR-031）
 *
 * 响应：二进制音频流 + `Content-Type: audio/*` + `x-trace-id` header
 * 错误：FR-005 OpenAI 风格 JSON
 */
export function createAudioSpeechRoute(deps: GatewayDeps) {
  return new Elysia().post(
    '/audio/speech',
    async rctx => {
      const ctxObj = rctx as unknown as {
        request: Request;
        set: { headers: Record<string, string | number>; status?: number };
        auth?: {
          userId?: string;
          channel?: 'cookie' | 'authorization' | 'x-api-key';
        };
      };
      const { request, set } = ctxObj;
      const contentType = (request.headers.get('content-type') ?? '').toLowerCase();

      let payload: ParsedSynthesisInput;
      if (contentType.startsWith('multipart/form-data')) {
        const form = await request.formData();
        payload = parseMultipartBody(form);
      } else {
        const json = await request.json().catch(() => null);
        payload = parseJsonBody(json);
      }

      if (payload.input.length > MAX_INPUT_CHARS) {
        throw new ValidationError(`input length ${payload.input.length} exceeds 4096 character limit`, {
          code: 'text_too_long',
          param: 'input'
        });
      }

      const { provider, providerId } = resolveTtsProvider(payload.model, deps);

      const ctx = createRequestContext({
        entry: 'openai-v1',
        modality: 'tts',
        clientSignal: request.signal,
        userId: ctxObj.auth?.userId ?? null,
        authChannel: ctxObj.auth?.channel ?? null
      });
      setTraceHeader(set, ctx.traceId);

      let voiceReferenceMeta: TtsRequest['voiceReference'] | undefined;
      if (payload.voiceReference) {
        const file = payload.voiceReference;
        const ext = inferRefExt(file.name, file.type ?? '');
        const buf = Buffer.from(await file.arrayBuffer());
        const path = await deps.retentionStore.register(ctx.traceId, ext, buf);
        ctx.retentionFiles.push(path);
        voiceReferenceMeta = {
          path,
          mimeType: file.type ?? 'audio/wav'
        };
      }

      const ttsReq: TtsRequest = {
        modelId: payload.model,
        input: payload.input,
        voice: payload.voice,
        responseFormat: payload.responseFormat,
        speed: payload.speed,
        voiceReference: voiceReferenceMeta
      };

      const result = await provider.synthesize(ttsReq, ctx.combinedSignal);

      return new Response(result.audio, {
        headers: {
          'content-type': result.contentType,
          'cache-control': 'no-cache',
          'x-aiao-provider': providerId,
          'x-aiao-model': payload.model,
          [X_TRACE_ID_HEADER]: ctx.traceId
        }
      });
    },
    {
      detail: {
        tags: ['Gateway-OpenAI'],
        summary: 'TTS 合成',
        description:
          '与 OpenAI /v1/audio/speech 协议保真，默认 JSON，reference voice 升级 multipart；4096 字符上限；错误体见 FR-005 OpenAI 风格'
      }
    }
  );
}
