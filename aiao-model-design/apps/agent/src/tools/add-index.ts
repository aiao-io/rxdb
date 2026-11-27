import type { ModelToolOutput } from '@aiao-model-design/model-ops';
import { tool } from 'ai';
import { z } from 'zod';
import { collect, commit, failed, findEntity, findProperty, modelText, type ToolDeps } from './support';

/** 按属性名新增索引。 */
export function addIndexTool(deps: ToolDeps) {
  return tool({
    description: '给一个实体新增索引，按顺序列出组成索引的属性名；unique 为 true 时是唯一索引。',
    inputSchema: z.object({
      entity: z.string().describe('实体名'),
      properties: z.array(z.string()).min(1).describe('组成索引的属性名'),
      unique: z.boolean().optional()
    }),
    execute: ({ entity, properties, unique }): ModelToolOutput => {
      const target = findEntity(deps.draft.get(), entity);
      if (!target.ok) return failed([target.error]);
      const found = collect(properties.map(name => findProperty(target.value, name)));
      if (!found.ok) return failed([found.error]);
      const index = {
        id: deps.newId(),
        propertyIds: found.value.map(property => property.id),
        isUnique: unique ?? false
      };
      const label = `${unique ? '唯一' : ''}索引 (${properties.join(', ')})`;
      return commit(deps, [{ op: 'addIndex', entityId: target.value.id, index }], `已为 ${entity} 新增${label}`);
    },
    toModelOutput: ({ output }) => modelText(output)
  });
}
