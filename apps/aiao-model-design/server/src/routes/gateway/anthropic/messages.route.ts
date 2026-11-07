import { Elysia, t } from 'elysia';
import { ModelNotFoundError, ValidationError } from '../../../gateway/core/errors';
import { createRequestContext } from '../../../gateway/core/request-context';
import { X_TRACE_ID_HEADER, setTraceHeader } from '../../../gateway/core/trace-header';
import type { ChatProvider, ChatRequest, FinishReason } from '../../../gateway/providers/types';
import type { GatewayDeps } from '../index';
import { normalizeAnthropicRequest, type AnthropicMessagesRequest } from './request-normalizer';
import { serializeAnthropicMessagesStream } from './stream-serializer';

const MessagesBody = t.Object(
  {
    model: t.String({ minLength: 1 }),
    messages: t.Array(
      t.Object({
        role: t.Union([t.Literal('user'), t.Literal('assistant')]),
        content: t.Union([
          t.String(),
          t.Array(t.Object({ type: t.String(), text: t.Optional(t.String()) }, { additionalProperties: true }))
        ])
      }),
      { minItems: 1 }
    ),
    max_tokens: t.Optional(t.Integer({ minimum: 1 })),
    system: t.Optional(
      t.Union([
        t.String(),
        t.Array(t.Object({ type: t.Literal('text'), text: t.String() }, { additionalProperties: true }))
      ])
    ),
    temperature: t.Optional(t.Number()),
    top_p: t.Optional(t.Number()),
    stop_sequences: t.Optional(t.Array(t.String())),
    stream: t.Optional(t.Boolean()),
    tools: t.Optional(t.Array(t.Any())),
    tool_choice: t.Optional(t.Any()),
    metadata: t.Optional(t.Any())
  },
  { additionalProperties: true }
);

type MessagesBodyT = typeof MessagesBody.static;

const checkUnsupportedFields = (body: MessagesBodyT): void => {
  if (body.tools && body.tools.length > 0) {
    throw new ValidationError('this gateway does not support tools yet', {
      code: 'unsupported_field',
      param: 'tools'
    });
  }
  if (body.tool_choice !== undefined) {
    throw new ValidationError('this gateway does not support tool_choice yet', {
      code: 'unsupported_field',
      param: 'tool_choice'
    });
  }
};

const mapStopReasonToAnthropic = (reason: FinishReason): string => {
  if (reason === 'length') return 'max_tokens';
  if (reason === 'content_filter') return 'stop_sequence';
  return 'end_turn';
};

interface RouteContext {
  body: MessagesBodyT;
  set: { headers: Record<string, string | number>; status?: number | string };
  request: Request;
  auth?: { userId?: string; channel?: 'cookie' | 'authorization' | 'x-api-key' };
}

const resolveChatProvider = (modelId: string, deps: GatewayDeps): ChatProvider => {
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
  return provider as ChatProvider;
};

/**
 * 构造 POST /v1/messages 路由（Anthropic 入口 / T048）
 *
 * - 接受任意 `anthropic-version` header 值（FR-054：不强校验）
 * - 顶层 `system` 由 request-normalizer 合并到 messages[0]
 * - `tools` / `tool_choice` 等已知未实现字段 → 422 `unsupported_field`（FR-055）
 * - 未注册 model → 404 `model_not_found`（FR-056）
 * - 流式：返回 Anthropic SSE 事件流；非流式：返回完整 message 对象
 */
export function createAnthropicMessagesRoute(deps: GatewayDeps) {
  return new Elysia().post(
    '/messages',
    async (rctx: RouteContext) => {
      const { body, set, request } = rctx;
      checkUnsupportedFields(body);

      const normalized = normalizeAnthropicRequest(body as unknown as AnthropicMessagesRequest);
      const provider = resolveChatProvider(normalized.modelId, deps);

      const ctx = createRequestContext({
        entry: 'anthropic-v1',
        modality: 'chat',
        clientSignal: request.signal,
        userId: rctx.auth?.userId ?? null,
        authChannel: rctx.auth?.channel ?? null
      });
      setTraceHeader(set, ctx.traceId);

      const chatReq: ChatRequest = {
        modelId: normalized.modelId,
        messages: normalized.messages,
        temperature: normalized.temperature,
        topP: normalized.topP,
        maxTokens: normalized.maxTokens,
        stop: normalized.stop,
        stream: normalized.stream
      };

      if (normalized.stream) {
        const source = provider.stream(chatReq, ctx.combinedSignal);
        const stream = serializeAnthropicMessagesStream({
          source,
          modelId: normalized.modelId,
          ctx
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
      const messageId = `msg_${ctx.traceId.replace(/-/g, '').slice(0, 24)}`;
      return {
        id: messageId,
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: result.text }],
        model: normalized.modelId,
        stop_reason: mapStopReasonToAnthropic(result.finishReason),
        stop_sequence: null,
        usage:
          result.usage ?
            {
              input_tokens: result.usage.promptTokens,
              output_tokens: result.usage.completionTokens
            }
          : { input_tokens: 0, output_tokens: 0 }
      };
    },
    {
      body: MessagesBody,
      detail: {
        tags: ['Gateway-Anthropic'],
        summary: 'Messages（chat 流式/非流式）',
        description:
          '与 Anthropic /v1/messages 协议保真，错误体见 FR-005 Anthropic 风格；anthropic-version header 接受任意值'
      }
    }
  );
}
