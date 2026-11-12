import type { ModelOp, ModelToolOutput } from '@aiao-model-design/model-ops';
import { tool } from 'ai';
import { z } from 'zod';
import { collect, commit, failed, findEntity, modelText, type ToolDeps } from './support';

/** 删除实体，并删除它自己的关系以及指向它的关系。 */
export function removeEntitiesTool(deps: ToolDeps) {
  return tool({
    description: '删除一个或多个实体。它们自己的关系、以及其他实体指向它们的关系会两端一起删除。',
    inputSchema: z.object({ entities: z.array(z.string()).min(1).describe('要删除的实体名') }),
    execute: ({ entities }): ModelToolOutput => {
      const snapshot = deps.draft.get();
      const found = collect(entities.map(name => findEntity(snapshot, name)));
      if (!found.ok) return failed([found.error]);
      const removed = new Set(found.value.map(entity => entity.id));
      const relations = snapshot.entities.flatMap(owner =>
        owner.relations
          .filter(relation => removed.has(owner.id) || removed.has(relation.mappedEntityId))
          .map(relation => ({ owner, relation }))
      );
      const ops: ModelOp[] = [
        ...relations.map(({ owner, relation }): ModelOp => ({
          op: 'removeRelation',
          entityId: owner.id,
          relationId: relation.id
        })),
        ...found.value.map((entity): ModelOp => ({ op: 'removeEntity', entityId: entity.id }))
      ];
      const cleaned = relations.map(({ owner, relation }) => `${owner.name}.${relation.name}`);
      const summary = `已删除实体 ${entities.join('、')}${cleaned.length ? `，并清理关系 ${cleaned.join('、')}` : ''}`;
      return commit(deps, ops, summary);
    },
    toModelOutput: ({ output }) => modelText(output)
  });
}
