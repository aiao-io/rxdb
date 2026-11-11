import { createOpenAI } from '@ai-sdk/openai';
import { APICallError, Output, streamText } from 'ai';
import { z } from 'zod';
import { ModelGenerationOutputSchema } from './prompts/model-schema';
import { buildSystemChatPrompt } from './prompts/system-chat';
import { buildSystemGeneratePrompt } from './prompts/system-generate';

/** 模型服务配置，只由 Worker 环境提供。 */
export interface AiEnvironment {
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_BASE_URL?: string;
  DEEPSEEK_MODEL?: string;
}

const GenerateBody = z.object({
  prompt: z.string().min(1).max(5000),
  existingModel: z
    .object({
      entityNames: z.array(z.string()).max(200),
      entities: z.array(z.unknown()).max(50).optional()
    })
    .optional()
});

const ChatBody = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(20000) }))
    .min(1)
    .max(100),
  modelContext: z
    .object({
      entityNames: z.array(z.string()).max(200),
      selectedEntity: z.unknown().optional(),
      relatedEntities: z.array(z.unknown()).max(50).optional(),
      selectedEntityProperties: z.array(z.string()).optional(),
      selectedEntityRelations: z.array(z.string()).optional()
    })
    .optional()
});

interface AiErrorBody {
  type: 'validation' | 'server' | 'rate-limit' | 'timeout';
  message: string;
  status: number;
}

function aiError(error: unknown): AiErrorBody {
  if (APICallError.isInstance(error) && error.statusCode === 429)
    return { type: 'rate-limit', message: 'AI rate limit exceeded', status: 429 };
  if (error instanceof Error && error.name === 'TimeoutError')
    return { type: 'timeout', message: 'AI request timed out', status: 504 };
  return { type: 'server', message: 'AI service is unavailable', status: 502 };
}

function aiErrorDetails(error: unknown): Record<string, unknown> {
  if (APICallError.isInstance(error)) {
    let endpoint = 'unknown';
    try {
      const url = new URL(error.url);
      endpoint = `${url.origin}${url.pathname}`;
    } catch {
      endpoint = 'invalid-url';
    }
    const cause = error.cause;
    return {
      kind: 'api-call',
      endpoint,
      statusCode: error.statusCode,
      isRetryable: error.isRetryable,
      causeName: cause instanceof Error ? cause.name : undefined,
      causeCode: cause && typeof cause === 'object' && 'code' in cause ? cause.code : undefined
    };
  }
  return {
    kind: error instanceof Error ? error.name : typeof error,
    causeCode: error && typeof error === 'object' && 'code' in error ? error.code : undefined
  };
}

function reportAiError(error: unknown): string {
  console.error('[aiao-model-design] AI upstream request failed', aiErrorDetails(error));
  return JSON.stringify(aiError(error));
}

function existingContext(existing: z.infer<typeof GenerateBody>['existingModel']): string | undefined {
  if (!existing) return undefined;
  const lines = [`已有实体名称：${existing.entityNames.join(', ')}`];
  if (existing.entities?.length) lines.push('已有实体详细结构：', JSON.stringify(existing.entities, null, 2));
  return lines.join('\n');
}

function model(env: AiEnvironment) {
  const provider = createOpenAI({
    apiKey: env.DEEPSEEK_API_KEY,
    baseURL: (env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1').replace(/\/$/, '')
  });
  return provider.responses(env.DEEPSEEK_MODEL ?? 'deepseek-flash');
}

/** 模型生成和迭代统一输出 AI SDK UI Message SSE。 */
export async function createAiResponse(request: Request, env: AiEnvironment): Promise<Response> {
  const path = new URL(request.url).pathname;
  const generate = path === '/api/ai/model/generate';
  if (!generate && path !== '/api/ai/model/chat') return Response.json({ error: 'not_found' }, { status: 404 });
  const body: unknown = await request.json().catch(() => null);
  const parsed = generate ? GenerateBody.safeParse(body) : ChatBody.safeParse(body);
  if (!parsed.success)
    return Response.json({ type: 'validation', message: 'Invalid model request', status: 400 }, { status: 400 });
  if (!env.DEEPSEEK_API_KEY?.trim())
    return Response.json({ type: 'server', message: 'DEEPSEEK_API_KEY is required', status: 503 }, { status: 503 });
  const abortSignal = AbortSignal.any([request.signal, AbortSignal.timeout(120000)]);
  try {
    if (generate) {
      const input = GenerateBody.parse(parsed.data);
      return streamText({
        model: model(env),
        output: Output.object({ schema: ModelGenerationOutputSchema }),
        system: buildSystemGeneratePrompt(existingContext(input.existingModel)),
        prompt: input.prompt,
        abortSignal,
        maxRetries: 0
      }).toUIMessageStreamResponse({
        headers: { 'cache-control': 'no-store, no-transform' },
        onError: reportAiError
      });
    }
    const input = ChatBody.parse(parsed.data);
    const result = streamText({
      model: model(env),
      system: buildSystemChatPrompt(input.modelContext ? JSON.stringify(input.modelContext, null, 2) : undefined),
      messages: input.messages,
      abortSignal,
      maxRetries: 0
    });
    return result.toUIMessageStreamResponse({
      headers: { 'cache-control': 'no-store, no-transform' },
      onError: reportAiError
    });
  } catch (error) {
    reportAiError(error);
    const body = aiError(error);
    return Response.json(body, { status: body.status });
  }
}
