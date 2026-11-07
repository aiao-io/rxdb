import { deepseek } from '@ai-sdk/deepseek';
import { Output, streamText } from 'ai';
import { Elysia, t } from 'elysia';
import { ModelGenerationOutputSchema } from './prompts/schema-definitions';
import { buildSystemGeneratePrompt } from './prompts/system-generate';

const ModelGenerateBody = t.Object({
  prompt: t.String({ minLength: 1, maxLength: 5000 }),
  existingModel: t.Optional(
    t.Object({
      entityNames: t.Array(t.String(), { maxItems: 200 }),
      entities: t.Optional(t.Array(t.Any(), { maxItems: 50 }))
    })
  )
});

/**
 * 构造 POST /api/ai/model/generate 路由（项目兼容路径 / T053）
 *
 * **特殊路径说明**：
 * - 此端点输出 *渐进式 JSON 文本流*（structured output via `streamText` + `Output.object`），
 *   不是 token 级 text delta，故无法直接套用通用 `ChatProvider` 抽象。
 * - 当前实现保留原 routes/ai/model-generate.route.ts 的直连 deepseek 模式，
 *   读 env `DEEPSEEK_API_KEY` 与 base URL（与 providers.yaml 中 deepseek 配置一致）。
 * - 未来若 ChatProvider 引入 `streamStructured(req, schema, signal)` 方法可统一。
 *
 * dashboard `AiApiService.generate()` 通过 `#streamRawText` 或 `#streamObject` 消费此响应。
 */
export function createProjectCompatModelGenerateRoute() {
  return new Elysia().post(
    '/model/generate',
    async ({ body }) => {
      const { prompt, existingModel } = body;

      let existingContext: string | undefined;
      if (existingModel) {
        const lines = [`已有实体名称：${existingModel.entityNames.join(', ')}`];
        if (existingModel.entities?.length) {
          lines.push('已有实体详细结构：');
          lines.push(JSON.stringify(existingModel.entities, null, 2));
        }
        existingContext = lines.join('\n');
      }

      const stream = streamText({
        // // 将原来的 'deepseek-chat', 'deepseek-v4-pro'
        model: deepseek('deepseek-chat'),
        output: Output.object({ schema: ModelGenerationOutputSchema }),
        system: buildSystemGeneratePrompt(existingContext),
        prompt
      });
      return stream.toTextStreamResponse();
    },
    {
      body: ModelGenerateBody,
      detail: {
        tags: ['Gateway-ProjectCompat'],
        summary: '项目兼容：结构化模型生成',
        description:
          'POST /api/ai/model/generate — streamText + Output.object 渐进式 JSON 文本流；与 dashboard StructuredObject 协议契约'
      }
    }
  );
}
