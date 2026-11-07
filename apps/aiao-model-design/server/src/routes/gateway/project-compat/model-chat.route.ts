import { Elysia, t } from 'elysia';
import { ModelNotFoundError } from '../../../gateway/core/errors';
import { createRequestContext } from '../../../gateway/core/request-context';
import { X_TRACE_ID_HEADER, setTraceHeader } from '../../../gateway/core/trace-header';
import type { ChatMessage, ChatProvider, ChatRequest } from '../../../gateway/providers/types';
import type { GatewayDeps } from '../index';
import { buildSystemChatPrompt } from './prompts/system-chat';
import { serializeAiSdkDataStream } from './stream-writer';

const ModelChatBody = t.Object({
  messages: t.Array(
    t.Object({
      role: t.Union([t.Literal('user'), t.Literal('assistant')]),
      content: t.String({ minLength: 1 })
    }),
    { minItems: 1 }
  ),
  modelContext: t.Optional(
    t.Object({
      entityNames: t.Array(t.String(), { maxItems: 200 }),
      selectedEntity: t.Optional(t.String()),
      selectedEntityProperties: t.Optional(t.Array(t.String())),
      selectedEntityRelations: t.Optional(t.Array(t.String()))
    })
  )
});

type ModelChatBodyT = typeof ModelChatBody.static;

interface RouteContext {
  body: ModelChatBodyT;
  set: { headers: Record<string, string | number>; status?: number | string };
  request: Request;
  auth?: { userId?: string; channel?: 'cookie' | 'authorization' | 'x-api-key' };
}

/** 解析网关内核配置的 default chat provider，供各 project-compat 聊天路由共用（FR-052） */
export const resolveDefaultChatProvider = (deps: GatewayDeps): ChatProvider => {
  const defaultId = deps.providerRegistry.defaultByModality.chat;
  if (!defaultId) {
    throw new ModelNotFoundError('chat-default');
  }
  const provider = deps.providerRegistry.providers.get(defaultId);
  if (!provider || provider.modality !== 'chat') {
    throw new ModelNotFoundError('chat-default');
  }
  return provider as ChatProvider;
};

/**
 * 构造 POST /api/ai/model/chat 路由（项目兼容路径 / T052）
 *
 * - 请求体不带 `model` 字段，走 default chat provider 兜底（FR-003）
 * - system prompt 由 dashboard `modelContext` 拼装
 * - 响应是 AI SDK data stream 文本流（dashboard `AiApiService.chat()` 消费契约）
 * - **共享 ChatProvider 实例**：与 /v1/chat/completions、/v1/messages 共用同一对象（FR-052）
 */
export function createProjectCompatModelChatRoute(deps: GatewayDeps) {
  return new Elysia().post(
    '/model/chat',
    async (rctx: RouteContext) => {
      const { body, set, request } = rctx;
      const provider = resolveDefaultChatProvider(deps);

      const ctx = createRequestContext({
        entry: 'project-compat',
        modality: 'chat',
        clientSignal: request.signal,
        userId: rctx.auth?.userId ?? null,
        authChannel: rctx.auth?.channel ?? null
      });
      setTraceHeader(set, ctx.traceId);

      const contextStr = body.modelContext ? JSON.stringify(body.modelContext, null, 2) : undefined;
      const systemPrompt = buildSystemChatPrompt(contextStr);

      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...body.messages.map(m => ({
          role: m.role,
          content: m.content
        }))
      ];

      const chatReq: ChatRequest = {
        modelId: provider.modelIds[0],
        messages,
        stream: true
      };

      const source = provider.stream(chatReq, ctx.combinedSignal);
      const stream = serializeAiSdkDataStream({ source, ctx });

      return new Response(stream, {
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'no-cache',
          [X_TRACE_ID_HEADER]: ctx.traceId
        }
      });
    },
    {
      body: ModelChatBody,
      detail: {
        tags: ['Gateway-ProjectCompat'],
        summary: '项目兼容：模型对话流式',
        description:
          'POST /api/ai/model/chat — 通过网关内核 default chat provider，输出 AI SDK data stream 文本流（dashboard AiApiService 协议）'
      }
    }
  );
}
