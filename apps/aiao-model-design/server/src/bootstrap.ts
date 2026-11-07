import { cors } from '@elysiajs/cors';
import { openapi } from '@elysiajs/openapi';
import { serverTiming } from '@elysiajs/server-timing';
import { Elysia, ValidationError } from 'elysia';
import type { JWTVerifyGetKey } from 'jose';
import { config } from './config';
import { classifyError } from './gateway/core/error-classifier';
import { RetentionStore } from './gateway/core/retention';
import type { EntryStyle, GatewayError } from './gateway/core/types';
import deepseekChatFactory from './gateway/providers/deepseek-chat.factory';
import mockEchoFactory from './gateway/providers/mock-echo.factory';
import openAiCompatAsrFactory from './gateway/providers/openai-compat-asr.factory';
import openAiCompatTtsFactory from './gateway/providers/openai-compat-tts.factory';
import { loadProviderConfigs } from './gateway/registry/config-loader';
import { bootstrapModelRegistry } from './gateway/registry/model-registry';
import { bootstrapProviderRegistry, type ProviderFactory } from './gateway/registry/provider-registry';
import { createGatewayRoutes } from './routes/gateway';
import { mapGatewayErrorToAnthropic } from './routes/gateway/anthropic/error-mapper';
import { mapGatewayErrorToOpenAi } from './routes/gateway/openai/error-mapper';
import { modelDesignerRoutes } from './routes/model-designer/routes';

/**
 * 内置 provider factories（FR-002 / FR-042）
 *
 * 新增 provider 时在此 export 追加 factory 引用，或通过 `createApp({ factories })` 注入。
 */
export const DEFAULT_FACTORIES: ProviderFactory[] = [
  deepseekChatFactory,
  mockEchoFactory,
  openAiCompatAsrFactory,
  openAiCompatTtsFactory
];

/**
 * GatewayError → 按入口风格序列化的 HTTP 响应（FR-005）
 *
 * 三套响应体（anthropic-v1 / openai-v1 / project-compat）是对外契约，
 * 全局 `onError` 的所有分支共用同一个序列化器，避免某条分支自己拼一套形状。
 *
 * @param entry 由请求路径判定的入口风格
 * @param err 已分类的内核错误
 * @param traceId 有则写入 `x-trace-id`；路由未命中这类无上下文错误可省略
 */
function errorResponse(entry: EntryStyle, err: GatewayError, traceId?: string): Response {
  const body =
    entry === 'anthropic-v1' ? { type: 'error', error: mapGatewayErrorToAnthropic(err) }
    : entry === 'openai-v1' ? { error: mapGatewayErrorToOpenAi(err) }
    : { type: err.type, message: err.message, status: err.httpStatus };

  return new Response(JSON.stringify(body), {
    status: err.httpStatus,
    headers: {
      'content-type': 'application/json',
      ...(traceId ? { 'x-trace-id': traceId } : {})
    }
  });
}

/**
 * Elysia ValidationError → 单行可读摘要
 *
 * `error.message` 是整份 TypeBox 报告的 JSON，既含 schema 结构也回显调用方提交的原值。
 * 只取每条 `summary`，缺失时退回一句通用文案，不把内部结构写进响应体。
 */
function validationSummary(error: unknown): string {
  if (!(error instanceof ValidationError)) return 'Request validation failed';
  const summaries = error.all.map(e => e.summary).filter((s): s is string => Boolean(s));
  return summaries.length > 0 ? summaries.join('; ') : 'Request validation failed';
}

/**
 * Elysia 框架自身的错误码 → 内核错误口径（known-defects #18 / #19）
 *
 * 这些错误由框架而非 provider 抛出，`classifyError` 认不出、会落到 `server` 兜底的 500——
 * 于是路径拼错、请求体缺字段、body 不是 JSON，用户拿到的全都是「服务器炸了」。
 * 状态码沿用内核已有口径（route/model 未找到 404、校验失败 422），三套错误体形状不变。
 */
const FRAMEWORK_ERRORS: Record<string, (error: unknown, request: Request, url: URL) => GatewayError> = {
  NOT_FOUND: (_error, request, url) => ({
    type: 'validation',
    message: `Route not found: ${request.method} ${url.pathname}`,
    httpStatus: 404,
    code: 'route_not_found'
  }),
  VALIDATION: error => ({
    type: 'validation',
    message: validationSummary(error),
    httpStatus: 422,
    code: 'invalid_request'
  }),
  PARSE: () => ({
    type: 'validation',
    message: 'Malformed request body',
    httpStatus: 400,
    code: 'malformed_request_body'
  })
};

export interface CreateAppOptions {
  /** Provider factories；默认 = 内置 chat factories；可用于测试覆盖 */
  factories?: ProviderFactory[];
  /** Supabase JWKS URL（默认从 env 读取） */
  jwksUrl?: string;
  /** 测试用：注入本地 JWKS 替代远程 fetch */
  jwksOverride?: JWTVerifyGetKey;
  /** 测试用：retention 目录覆盖 */
  retentionRootDir?: string;
  /** 测试用：自定义 providers.yaml 路径 */
  providersConfigPath?: string;
}

/**
 * 启动期装配整个 apps/api Elysia 应用
 *
 * 1. RetentionStore：mkdir 0700 + 启动 sweep + 启动周期巡检
 * 2. ProviderRegistry：读 providers.yaml → capability/default 校验 → 并发健康探活
 * 3. ModelRegistry：从 enabled providers 收集 model id，全局唯一性校验
 * 4. Gateway routes：注入 deps，挂在 `/v1/*`
 * 5. 现有非网关路由（auth / me / user / ai）保持原状（Phase 3 T054 时迁移 ai 路径）
 *
 * @returns 完整可 listen 的 Elysia 实例
 */
export async function createApp(opts: CreateAppOptions = {}) {
  const factories = opts.factories ?? DEFAULT_FACTORIES;
  const jwksUrl = opts.jwksUrl ?? process.env.SUPABASE_JWT_ISSUER_URL ?? '';

  const retentionStore = new RetentionStore(opts.retentionRootDir ? { rootDir: opts.retentionRootDir } : {});
  await retentionStore.startupSweep();
  retentionStore.startInterval();

  const { configs } = loadProviderConfigs(opts.providersConfigPath);
  const providerRegistry = await bootstrapProviderRegistry({ configs, factories });
  const modelRegistry = bootstrapModelRegistry({
    providers: providerRegistry.providers,
    configs
  });

  // 空字符串 env（.env 里 `SUPABASE_JWT_ISSUER=`）不能传给 jose：
  // 本地 GoTrue 用户 access_token 常无 iss claim，空串会触发 missing iss。
  const audience = process.env.SUPABASE_JWT_AUDIENCE?.trim() || undefined;
  const issuer = process.env.SUPABASE_JWT_ISSUER?.trim() || undefined;
  const jwtSecret = process.env.SUPABASE_JWT_SECRET?.trim() || undefined;

  const gateway = createGatewayRoutes({
    providerRegistry,
    modelRegistry,
    retentionStore,
    jwtOptions: {
      jwksUrl,
      audience,
      issuer,
      // 本地 GoTrue 默认 HS256：仅当未配置 JWKS 时由 jwt-verifier 使用
      jwtSecret
    },
    jwksOverride: opts.jwksOverride
  });

  return new Elysia()
    .use(
      cors({
        origin: config.CORS_ORIGINS,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Api-Key', 'Anthropic-Version']
      })
    )
    .use(
      openapi({
        documentation: {
          info: {
            title: 'AIAO Enterprise API',
            version: '1.0.0',
            description: 'AIAO Enterprise 后端 REST API + Model Gateway'
          },
          tags: [
            { name: 'Auth', description: '认证相关接口' },
            { name: 'Me', description: '当前用户接口' },
            { name: 'Users', description: '用户管理接口' },
            { name: 'AI', description: 'AI 对话与生成接口（项目兼容路径）' },
            { name: 'Gateway-OpenAI', description: 'OpenAI v1 兼容入口' },
            { name: 'Gateway-Anthropic', description: 'Anthropic v1 兼容入口' },
            {
              name: 'Gateway-ProjectCompat',
              description: '项目兼容路径（/api/ai/*）'
            }
          ]
        }
      })
    )
    .use(serverTiming())
    .use(gateway)
    .group('/api', subApp => subApp.use(modelDesignerRoutes))
    .get('/', 'Hello World')
    .onError(({ code, error, request }) => {
      const url = new URL(request.url);
      const entry: EntryStyle =
        url.pathname.startsWith('/v1/messages') ? 'anthropic-v1'
        : url.pathname.startsWith('/v1/') ? 'openai-v1'
        : 'project-compat';

      const framework = FRAMEWORK_ERRORS[code];
      if (framework) {
        return errorResponse(entry, framework(error, request, url));
      }

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
      const gatewayError = classifyError(error, dummyCtx);
      if (!gatewayError) {
        return new Response(null, { status: 499 });
      }

      console.error(
        `[gateway] error trace=${dummyCtx.traceId} path=${url.pathname} entry=${entry} type=${gatewayError.type} msg=${gatewayError.message}`,
        gatewayError.cause
      );

      return errorResponse(entry, gatewayError, dummyCtx.traceId);
    });
}
