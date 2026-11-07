import { Elysia, t } from 'elysia';
import { ModelNotFoundError, ValidationError } from '../../../gateway/core/errors';
import { createRequestContext } from '../../../gateway/core/request-context';
import { X_TRACE_ID_HEADER, setTraceHeader } from '../../../gateway/core/trace-header';
import type { ChatMessage, ChatProvider, ChatRequest } from '../../../gateway/providers/types';
import type { GatewayDeps } from '../index';
import { serializeOpenAiChatStream } from './stream-serializer';

const ChatCompletionsBody = t.Object(
  {
    model: t.String({ minLength: 1 }),
    messages: t.Array(
      t.Object({
        role: t.Union([t.Literal('system'), t.Literal('user'), t.Literal('assistant')]),
        content: t.String()
      }),
      { minItems: 1 }
    ),
    stream: t.Optional(t.Boolean()),
    stream_options: t.Optional(t.Object({ include_usage: t.Optional(t.Boolean()) })),
    temperature: t.Optional(t.Number()),
    top_p: t.Optional(t.Number()),
    max_tokens: t.Optional(t.Integer()),
    max_completion_tokens: t.Optional(t.Integer()),
    stop: t.Optional(t.Union([t.String(), t.Array(t.String())])),
    /** 已知但未实现的字段 — handler 内拒绝并返回 422 */
    logprobs: t.Optional(t.Boolean()),
    seed: t.Optional(t.Integer()),
    tools: t.Optional(t.Array(t.Any())),
    parallel_tool_calls: t.Optional(t.Boolean()),
    response_format: t.Optional(t.Any())
  },
  { additionalProperties: true }
);

type ChatCompletionsBodyT = typeof ChatCompletionsBody.static;

const checkUnsupportedFields = (body: ChatCompletionsBodyT): void => {
  if (body.logprobs) {
    throw new ValidationError('this gateway does not support logprobs yet', {
      code: 'unsupported_field',
      param: 'logprobs'
    });
  }
  if (body.seed !== undefined) {
    throw new ValidationError('this gateway does not support seed yet', {
      code: 'unsupported_field',
      param: 'seed'
    });
  }
  if (body.tools && body.tools.length > 0) {
    throw new ValidationError('this gateway does not support tools yet', {
      code: 'unsupported_field',
      param: 'tools'
    });
  }
  if (body.parallel_tool_calls !== undefined) {
    throw new ValidationError('this gateway does not support parallel_tool_calls yet', {
      code: 'unsupported_field',
      param: 'parallel_tool_calls'
    });
  }
  const rf = body.response_format as { type?: string } | undefined;
  if (rf && rf.type === 'json_schema') {
    throw new ValidationError('this gateway does not support response_format.type=json_schema yet', {
      code: 'unsupported_field',
      param: 'response_format'
    });
  }
};

const buildChatRequest = (body: ChatCompletionsBodyT, isStream: boolean, includeUsage: boolean): ChatRequest => ({
  modelId: body.model,
  messages: body.messages as ChatMessage[],
  temperature: body.temperature,
  topP: body.top_p,
  maxTokens: body.max_tokens ?? body.max_completion_tokens,
  stop:
    typeof body.stop === 'string' ? [body.stop]
    : Array.isArray(body.stop) ? body.stop
    : undefined,
  stream: isStream,
  includeUsage
});

interface RouteContext {
  body: ChatCompletionsBodyT;
  set: { headers: Record<string, string | number>; status?: number | string };
  request: Request;
  auth?: { userId?: string; channel?: 'cookie' | 'authorization' | 'x-api-key' };
}

const resolveChatProvider = (
  modelId: string,
  deps: GatewayDeps
): { provider: ChatProvider; entryProviderId: string } => {
  const entry = deps.modelRegistry.byId.get(modelId);
  if (!entry) throw new ModelNotFoundError(modelId);
  if (entry.modality !== 'chat') {
    throw new ValidationError(`model "${modelId}" is registered as ${entry.modality}, not chat`, {
      code: 'invalid_model_for_endpoint',
      param: 'model'
    });
  }
  const provider = deps.providerRegistry.providers.get(entry.providerId);
  if (!provider || provider.modality !== 'chat') {
    throw new ModelNotFoundError(modelId);
  }
  return { provider: provider as ChatProvider, entryProviderId: entry.providerId };
};

/**
 * 构造 POST /v1/chat/completions 路由（FR-051 / T043）
 *
 * 协议保真：
 * - 流式：`stream: true` → SSE，由 `serializeOpenAiChatStream` 输出
 * - 非流式：完整 OpenAI `chat.completion` JSON 响应
 * - 错误统一走全局 onError → OpenAI 风格错误体
 *
 * FR-055 已知未实现字段：logprobs / seed / tools / response_format=json_schema 等 422 拒绝
 * FR-056 model registry：未注册 model → 404 model_not_found
 */
export function createChatCompletionsRoute(deps: GatewayDeps) {
  return new Elysia().post(
    '/chat/completions',
    async (rctx: RouteContext) => {
      const { body, set, request } = rctx;
      checkUnsupportedFields(body);
      const { provider } = resolveChatProvider(body.model, deps);

      const isStream = Boolean(body.stream);
      const includeUsage = body.stream_options?.include_usage ?? false;
      const ctx = createRequestContext({
        entry: 'openai-v1',
        modality: 'chat',
        clientSignal: request.signal,
        userId: rctx.auth?.userId ?? null,
        authChannel: rctx.auth?.channel ?? null
      });
      setTraceHeader(set, ctx.traceId);

      const chatReq = buildChatRequest(body, isStream, includeUsage);

      if (isStream) {
        const source = provider.stream(chatReq, ctx.combinedSignal);
        const stream = serializeOpenAiChatStream({
          source,
          modelId: body.model,
          ctx,
          includeUsage
        });
        return new Response(stream, {
          headers: {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            [X_TRACE_ID_HEADER]: ctx.traceId
          }
        });
      }

      const result = await provider.complete(chatReq, ctx.combinedSignal);
      const created = Math.floor(ctx.requestedAt / 1000);
      return {
        id: `chatcmpl-${ctx.traceId}`,
        object: 'chat.completion',
        created,
        model: body.model,
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: result.text },
            finish_reason: result.finishReason
          }
        ],
        usage:
          result.usage ?
            {
              prompt_tokens: result.usage.promptTokens,
              completion_tokens: result.usage.completionTokens,
              total_tokens: result.usage.promptTokens + result.usage.completionTokens
            }
          : undefined
      };
    },
    {
      body: ChatCompletionsBody,
      detail: {
        tags: ['Gateway-OpenAI'],
        summary: 'Chat 补全（流式/非流式）',
        description: '与 OpenAI /v1/chat/completions 协议保真，错误体见 FR-005 OpenAI 风格'
      }
    }
  );
}
