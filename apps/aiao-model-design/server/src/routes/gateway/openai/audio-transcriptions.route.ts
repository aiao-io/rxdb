import { Elysia, t } from 'elysia';
import { ModelNotFoundError, ValidationError } from '../../../gateway/core/errors';
import { createRequestContext } from '../../../gateway/core/request-context';
import { setTraceHeader } from '../../../gateway/core/trace-header';
import type { AsrProvider, AsrRequest } from '../../../gateway/providers/types';
import type { GatewayDeps } from '../index';

/** FR-020 单文件上限 25 MB（与 OpenAI 官方 whisper 默认一致） */
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

/**
 * 从文件名 / mime 推断扩展名（落盘文件路径用，FR-043 不接受非字母数字）
 *
 * 优先级：filename 后缀 → MIME 推断 → `bin` 兜底
 */
const inferExt = (filename: string | undefined, mimeType: string): string => {
  if (filename) {
    const dot = filename.lastIndexOf('.');
    if (dot > 0) {
      const ext = filename.slice(dot + 1).toLowerCase();
      if (/^[a-z0-9]+$/.test(ext) && ext.length <= 8) return ext;
    }
  }
  const m = mimeType.toLowerCase();
  if (m.includes('wav')) return 'wav';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  if (m.includes('webm')) return 'webm';
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('flac')) return 'flac';
  if (m.includes('m4a')) return 'm4a';
  if (m.includes('wave')) return 'wav';
  return 'bin';
};

const AudioTranscriptionsBody = t.Object(
  {
    // 不在 schema 上限制 maxSize：Elysia 的 maxSize 会抛 Elysia 内部 ValidationError，
    // 走 server 500 路径；改在 handler 内部显式检查并抛 my ValidationError，由 onError 归 422
    file: t.File(),
    model: t.String({ minLength: 1 }),
    language: t.Optional(t.String()),
    prompt: t.Optional(t.String()),
    response_format: t.Optional(
      t.Union([t.Literal('json'), t.Literal('text'), t.Literal('srt'), t.Literal('verbose_json'), t.Literal('vtt')])
    ),
    temperature: t.Optional(t.Numeric()),
    'timestamp_granularities[]': t.Optional(t.Array(t.String()))
  },
  { additionalProperties: true }
);

type AudioTranscriptionsBodyT = typeof AudioTranscriptionsBody.static;

interface RouteContext {
  body: AudioTranscriptionsBodyT;
  set: { headers: Record<string, string | number>; status?: number | string };
  request: Request;
  auth?: { userId?: string; channel?: 'cookie' | 'authorization' | 'x-api-key' };
}

const resolveAsrProvider = (modelId: string, deps: GatewayDeps): { provider: AsrProvider; providerId: string } => {
  const entry = deps.modelRegistry.byId.get(modelId);
  if (!entry) throw new ModelNotFoundError(modelId);
  if (entry.modality !== 'asr') {
    throw new ValidationError(`model "${modelId}" is registered as ${entry.modality}, not asr`, {
      code: 'invalid_model_for_endpoint',
      param: 'model'
    });
  }
  const provider = deps.providerRegistry.providers.get(entry.providerId);
  if (!provider || provider.modality !== 'asr') {
    throw new ModelNotFoundError(modelId);
  }
  return { provider: provider as AsrProvider, providerId: entry.providerId };
};

/**
 * 构造 POST /v1/audio/transcriptions 路由（OpenAI 兼容 / T062）
 *
 * - 仅接 multipart/form-data
 * - 25 MB 文件上限（FR-020）；超出 422 `audio_too_large`
 * - 落盘到 `/tmp/aiao-gateway/<traceId>.<ext>`（FR-043）由 RetentionStore 管理 5min TTL
 * - 路由到 ASR provider（FR-001 / FR-056）
 * - 响应严格 OpenAI 格式：`response_format='json'` → `{text}`；`'verbose_json'` → `{text,segments,language,duration}`
 * - provider/model 通过 `x-aiao-provider` / `x-aiao-model` header 透出，**不**注入 JSON body（FR-021 修订）
 */
export function createAudioTranscriptionsRoute(deps: GatewayDeps) {
  return new Elysia().post(
    '/audio/transcriptions',
    async (rctx: RouteContext) => {
      const { body, set, request } = rctx;
      const { provider, providerId } = resolveAsrProvider(body.model, deps);

      if (body.file.size > MAX_FILE_SIZE_BYTES) {
        throw new ValidationError(
          `audio file size ${body.file.size} bytes exceeds ${MAX_FILE_SIZE_BYTES} bytes (25 MB)`,
          { code: 'audio_too_large', param: 'file' }
        );
      }

      const ctx = createRequestContext({
        entry: 'openai-v1',
        modality: 'asr',
        clientSignal: request.signal,
        userId: rctx.auth?.userId ?? null,
        authChannel: rctx.auth?.channel ?? null
      });
      setTraceHeader(set, ctx.traceId);

      const ext = inferExt(body.file.name, body.file.type ?? '');
      const fileBuffer = Buffer.from(await body.file.arrayBuffer());
      const path = await deps.retentionStore.register(ctx.traceId, ext, fileBuffer);
      ctx.retentionFiles.push(path);

      const asrReq: AsrRequest = {
        modelId: body.model,
        audio: {
          path,
          mimeType: body.file.type ?? 'audio/wav',
          sizeBytes: body.file.size
        },
        language: body.language,
        prompt: body.prompt,
        responseFormat: body.response_format,
        temperature: typeof body.temperature === 'number' ? body.temperature : undefined
      };

      const result = await provider.transcribe(asrReq, ctx.combinedSignal);

      // FR-021: provider / model id 仅通过 header 暴露，不污染 OpenAI 标准 JSON body
      set.headers['x-aiao-provider'] = providerId;
      set.headers['x-aiao-model'] = body.model;

      if (body.response_format === 'verbose_json') {
        return {
          text: result.text,
          segments: result.segments ?? [],
          language: result.language ?? body.language ?? 'en',
          duration: result.duration ?? 0
        };
      }
      return { text: result.text };
    },
    {
      body: AudioTranscriptionsBody,
      type: 'formdata',
      detail: {
        tags: ['Gateway-OpenAI'],
        summary: 'ASR 转写',
        description:
          '与 OpenAI /v1/audio/transcriptions 协议保真，仅接 multipart；25MB/30min 上限；provider/model 通过 x-aiao-* header 暴露而非 body；错误体见 FR-005 OpenAI 风格'
      }
    }
  );
}
