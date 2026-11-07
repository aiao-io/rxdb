import { Elysia } from 'elysia';
import type { JWTVerifyGetKey } from 'jose';
import { authenticate, type AuthSource } from '../../gateway/auth/auth-middleware';
import type { JwtVerifierOptions } from '../../gateway/auth/jwt-verifier';
import { classifyError } from '../../gateway/core/error-classifier';
import type { RetentionStore } from '../../gateway/core/retention';
import type { EntryStyle } from '../../gateway/core/types';
import type { ModelRegistry } from '../../gateway/registry/model-registry';
import type { ProviderRegistry } from '../../gateway/registry/provider-registry';
import { mapGatewayErrorToAnthropic } from './anthropic/error-mapper';
import { createAnthropicMessagesRoute } from './anthropic/messages.route';
import { createNotificationsRoute } from './notifications/routes';
import { createAudioSpeechRoute } from './openai/audio-speech.route';
import { createAudioTranscriptionsRoute } from './openai/audio-transcriptions.route';
import { createChatCompletionsRoute } from './openai/chat-completions.route';
import { mapGatewayErrorToOpenAi } from './openai/error-mapper';
import { createModelsRoute } from './openai/models.route';
import { createProjectCompatAiChatRoute } from './project-compat/ai-chat.route';
import { createProjectCompatModelChatRoute } from './project-compat/model-chat.route';
import { createProjectCompatModelGenerateRoute } from './project-compat/model-generate.route';

/**
 * 网关入口子应用所需依赖
 *
 * 由 bootstrap.ts 在启动期一次性装配后注入。
 */
export interface GatewayDeps {
  providerRegistry: ProviderRegistry;
  modelRegistry: ModelRegistry;
  retentionStore: RetentionStore;
  jwtOptions: JwtVerifierOptions;
  /** 测试用：注入本地 JWKS 替代远程 fetch */
  jwksOverride?: JWTVerifyGetKey;
}

/**
 * 三通道鉴权 derive（FR-054）
 *
 * 把 cookie / authorization / x-api-key 任一携带的有效 Supabase JWT 校验通过后
 * 写入 `ctx.auth: AuthIdentity`；失败抛 UnauthorizedError，由全局 onError 处理。
 */
const buildAuthDerive =
  (deps: GatewayDeps) =>
  async ({
    headers
  }: {
    headers: Record<string, string | undefined>;
  }): Promise<{ auth: Awaited<ReturnType<typeof authenticate>> }> => {
    const src: AuthSource = {
      cookie: headers.cookie,
      authorization: headers.authorization,
      apiKey: headers['x-api-key']
    };
    const identity = await authenticate(src, deps.jwtOptions, deps.jwksOverride);
    return { auth: identity };
  };

/**
 * 构造网关入口 Elysia 子应用
 *
 * 已落地路由：
 * - `POST /v1/chat/completions`（US1 / T043）
 * - `GET /v1/models`（US1 / T044）
 *
 * 待 Phase 4/5 接管：
 * - `POST /v1/audio/transcriptions`（US2 / T062）
 * - `POST /v1/audio/speech`（US3 / T078）
 * - `POST /v1/messages`（US1 / T048）
 *
 * project-compat 路径 `/api/ai/*` 由 Phase 3.5/3.6 T054/T055 切换（仍走旧 routes/ai）。
 */
const buildErrorHandler =
  () =>
  ({ error, request, code }: { error: unknown; request: Request; code?: string | number }) => {
    const clientCtrl = new AbortController();
    const timeoutCtrl = new AbortController();
    const dummyCtx = {
      traceId: crypto.randomUUID(),
      entry: 'openai-v1' as const,
      modality: 'chat' as const,
      userId: null,
      authChannel: null,
      requestedAt: Date.now(),
      clientSignal: clientCtrl.signal,
      timeoutSignal: timeoutCtrl.signal,
      combinedSignal: AbortSignal.any([clientCtrl.signal, timeoutCtrl.signal]),
      retentionFiles: []
    };

    // Elysia 内部错误（schema validation / parse / not found）映射到 GatewayError.validation
    const elysiaValidationCodes = new Set<string | number>(['VALIDATION', 'PARSE']);
    const gatewayError =
      code !== undefined && elysiaValidationCodes.has(code) ?
        {
          type: 'validation' as const,
          message: (error as Error)?.message ?? 'Invalid request body',
          httpStatus: 422,
          code: 'invalid_request_body'
        }
      : classifyError(error, dummyCtx);
    if (!gatewayError) return new Response(null, { status: 499 });

    const url = new URL(request.url);
    const entry: EntryStyle =
      url.pathname.startsWith('/v1/messages') ? 'anthropic-v1'
      : url.pathname.startsWith('/v1/') ? 'openai-v1'
      : 'project-compat';

    console.error(
      `[gateway] error trace=${dummyCtx.traceId} path=${url.pathname} entry=${entry} type=${gatewayError.type} status=${gatewayError.httpStatus} msg=${gatewayError.message}`
    );

    const body =
      entry === 'anthropic-v1' ? { type: 'error', error: mapGatewayErrorToAnthropic(gatewayError) }
      : entry === 'openai-v1' ? { error: mapGatewayErrorToOpenAi(gatewayError) }
      : {
          type: gatewayError.type,
          message: gatewayError.message,
          status: gatewayError.httpStatus
        };

    return new Response(JSON.stringify(body), {
      status: gatewayError.httpStatus,
      headers: {
        'content-type': 'application/json',
        'x-trace-id': dummyCtx.traceId
      }
    });
  };

export function createGatewayRoutes(deps: GatewayDeps) {
  const authDerive = buildAuthDerive(deps);
  const errorHandler = buildErrorHandler();
  return new Elysia({ name: 'gateway' })
    .decorate('gateway', deps)
    .onError(errorHandler)
    .group('/v1', app =>
      app
        .derive(authDerive)
        .use(createChatCompletionsRoute(deps))
        .use(createModelsRoute(deps))
        .use(createAnthropicMessagesRoute(deps))
        .use(createAudioTranscriptionsRoute(deps))
        .use(createAudioSpeechRoute(deps))
        .use(createNotificationsRoute(deps))
    )
    .group('/api/ai', app =>
      app
        .derive(authDerive)
        .use(createProjectCompatAiChatRoute(deps))
        .use(createProjectCompatModelChatRoute(deps))
        .use(createProjectCompatModelGenerateRoute())
    );
}
