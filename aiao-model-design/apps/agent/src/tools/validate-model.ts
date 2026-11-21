import { type ModelToolOutput, validateModel } from '@aiao-model-design/model-ops';
import { tool } from 'ai';
import { z } from 'zod';
import { modelText, type ToolDeps } from './support';

/** 整体检查模型。 */
export function validateModelTool({ draft }: ToolDeps) {
  return tool({
    description:
      '检查整个模型：命名、重名、没有属性的实体、枚举选项、关系是否成对、索引引用。建模收尾时调用一次，有问题就修，修完再检查。',
    inputSchema: z.object({}),
    execute: (): ModelToolOutput => {
      const issues = validateModel(draft.get());
      const summary =
        issues.length ?
          `模型有 ${issues.length} 个问题：\n${issues.map(issue => `- ${issue}`).join('\n')}`
        : '模型校验通过，没有问题';
      return { ok: true, ops: [], summary };
    },
    toModelOutput: ({ output }) => modelText(output)
  });
}
