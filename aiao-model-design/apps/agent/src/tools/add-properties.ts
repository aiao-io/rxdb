import type { ModelOp, ModelToolOutput } from '@aiao-model-design/model-ops';
import { tool } from 'ai';
import { z } from 'zod';
import { commit, failed, findEntity, modelText, propertyInput, toProperty, type ToolDeps } from './support';

/** 给已有实体新增属性。 */
export function addPropertiesTool(deps: ToolDeps) {
  return tool({
    description: '给一个已有实体新增一个或多个属性。实体之间的引用不要建成属性，用 link_entities。',
    inputSchema: z.object({ entity: z.string().describe('实体名'), properties: z.array(propertyInput).min(1) }),
    execute: ({ entity, properties }): ModelToolOutput => {
      const found = findEntity(deps.draft.get(), entity);
      if (!found.ok) return failed([found.error]);
      const ops = properties.map((property): ModelOp => ({
        op: 'addProperty',
        entityId: found.value.id,
        property: toProperty(deps.newId(), property)
      }));
      return commit(deps, ops, `已为 ${entity} 新增属性 ${properties.map(property => property.name).join('、')}`);
    },
    toModelOutput: ({ output }) => modelText(output)
  });
}
