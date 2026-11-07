import { Elysia, t } from 'elysia';
import { createRequestContext } from '../../../gateway/core/request-context';
import { X_TRACE_ID_HEADER, setTraceHeader } from '../../../gateway/core/trace-header';
import type { ChatMessage, ChatRequest } from '../../../gateway/providers/types';
import type { GatewayDeps } from '../index';
import { resolveDefaultChatProvider } from './model-chat.route';
import { buildGenericChatPrompt } from './prompts/system-chat-generic';
import { serializeAiSdkDataStream } from './stream-writer';

const AiChatBody = t.Object({
  messages: t.Array(
    t.Object({
      role: t.Union([t.Literal('user'), t.Literal('assistant')]),
      content: t.String({ minLength: 1 })
    }),
    { minItems: 1 }
  ),
  context: t.Optional(
    t.Object({
      route: t.Optional(t.String()),
      topic: t.Optional(t.String())
    })
  )
});

type AiChatBodyT = typeof AiChatBody.static;

interface RouteContext {
  body: AiChatBodyT;
  set: { headers: Record<string, string | number>; status?: number | string };
  request: Request;
  auth?: { userId?: string; channel?: 'cookie' | 'authorization' | 'x-api-key' };
}

/**
 * 构造 POST /api/ai/chat 路由（通用对话流式）
 *
 * - 与 `/api/ai/model/chat` 结构一致但不绑定 model-designer 的 `modelContext`
 * - 供 AI Drawer 默认面板、文档助手、Agent Flow LLM 节点共用同一条服务端通道
 * - 响应是 AI SDK data stream 文本流，协议与 `/api/ai/model/chat` 一致
 * - **共享 ChatProvider 实例**：与 /v1/chat/completions、/v1/messages、/api/ai/model/chat 共用同一对象（FR-052）
 */
export function createProjectCompatAiChatRoute(deps: GatewayDeps) {
  return new Elysia().post(
    '/chat',
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

      const systemPrompt = buildGenericChatPrompt(body.context);

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
      body: AiChatBody,
      detail: {
        tags: ['Gateway-ProjectCompat'],
        summary: '通用对话流式',
        description:
          'POST /api/ai/chat — 通过网关内核 default chat provider，输出 AI SDK data stream 文本流，供 AI Drawer / 文档助手 / Agent Flow 共用'
      }
    }
  );
}
