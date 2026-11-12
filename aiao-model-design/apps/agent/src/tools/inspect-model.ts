import { type ModelToolOutput, outlineModel } from '@aiao-model-design/model-ops';
import { tool } from 'ai';
import { z } from 'zod';
import { modelText, type ToolDeps } from './support';

/** 查看模型概要，可只看指定实体。 */
export function inspectModelTool({ draft }: ToolDeps) {
  return tool({
    description:
      '查看当前模型。不传 entities 时返回全部实体；传入实体名时只返回这些实体的属性、关系与索引。结果只含名称，不含 ID。',
    inputSchema: z.object({ entities: z.array(z.string()).optional().describe('要查看的实体名') }),
    execute: ({ entities }): ModelToolOutput => {
      const snapshot = draft.get();
      const missing = (entities ?? []).filter(name => !snapshot.entities.some(entity => entity.name === name));
      const notes = missing.length ? [`不存在的实体：${missing.join('、')}`] : [];
      return { ok: true, ops: [], summary: [outlineModel(snapshot, entities), ...notes].join('\n') };
    },
    toModelOutput: ({ output }) => modelText(output)
  });
}
