import { tool } from 'ai';
import { z } from 'zod';
import type { ModelToolOutput } from '../../shared/model-ops/tool-output';
import type { SnapshotEntity, SnapshotIndex } from '../../shared/model-ops/types';
import { commit, failed, findEntity, modelText, type ToolDeps } from './support';

function columns(entity: SnapshotEntity, index: SnapshotIndex): string[] {
  return index.propertyIds.map(id => entity.properties.find(property => property.id === id)?.name ?? id);
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every(name => right.includes(name));
}

/** 按组成属性删除索引。 */
export function removeIndexTool(deps: ToolDeps) {
  return tool({
    description: '删除一个实体上由指定属性组成的索引，属性顺序不限。',
    inputSchema: z.object({ entity: z.string().describe('实体名'), properties: z.array(z.string()).min(1) }),
    execute: ({ entity, properties }): ModelToolOutput => {
      const target = findEntity(deps.draft.get(), entity);
      if (!target.ok) return failed([target.error]);
      const index = target.value.indexes.find(item => sameSet(columns(target.value, item), properties));
      if (!index) {
        const existing = target.value.indexes.map(item => `(${columns(target.value, item).join(', ')})`).join('、');
        return failed([`${entity} 上没有由 (${properties.join(', ')}) 组成的索引，现有索引：${existing || '（无）'}`]);
      }
      const label = `(${columns(target.value, index).join(', ')})`;
      return commit(
        deps,
        [{ op: 'removeIndex', entityId: target.value.id, indexId: index.id }],
        `已删除 ${entity} 的索引 ${label}`
      );
    },
    toModelOutput: ({ output }) => modelText(output)
  });
}
