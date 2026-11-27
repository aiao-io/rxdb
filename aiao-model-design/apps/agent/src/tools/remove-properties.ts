import type { ModelOp, ModelToolOutput } from '@aiao-model-design/model-ops';
import { tool } from 'ai';
import { z } from 'zod';
import { collect, commit, failed, findEntity, findProperty, modelText, type ToolDeps } from './support';

/** 删除属性，并先删掉引用这些属性的索引。 */
export function removePropertiesTool(deps: ToolDeps) {
  return tool({
    description: '删除一个实体上的一个或多个属性；引用这些属性的索引会先被删除。',
    inputSchema: z.object({ entity: z.string().describe('实体名'), properties: z.array(z.string()).min(1) }),
    execute: ({ entity, properties }): ModelToolOutput => {
      const target = findEntity(deps.draft.get(), entity);
      if (!target.ok) return failed([target.error]);
      const found = collect(properties.map(name => findProperty(target.value, name)));
      if (!found.ok) return failed([found.error]);
      const ids = new Set(found.value.map(property => property.id));
      const indexes = target.value.indexes.filter(index => index.propertyIds.some(id => ids.has(id)));
      const ops: ModelOp[] = [
        ...indexes.map((index): ModelOp => ({ op: 'removeIndex', entityId: target.value.id, indexId: index.id })),
        ...found.value.map((property): ModelOp => ({
          op: 'removeProperty',
          entityId: target.value.id,
          propertyId: property.id
        }))
      ];
      const cleaned = indexes.length ? `，并删除引用它的索引 ${indexes.length} 个` : '';
      return commit(deps, ops, `已删除 ${entity} 的属性 ${properties.join('、')}${cleaned}`);
    },
    toModelOutput: ({ output }) => modelText(output)
  });
}
