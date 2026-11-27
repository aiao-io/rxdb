import type {
  ModelOp,
  ModelSnapshot,
  ModelToolOutput,
  SnapshotEntity,
  SnapshotRelation
} from '@aiao-model-design/model-ops';
import { tool } from 'ai';
import { z } from 'zod';
import { collect, commit, failed, findEntity, findRelation, modelText, type Found, type ToolDeps } from './support';

interface Side {
  entity: SnapshotEntity;
  relation: SnapshotRelation;
}

function findSide(snapshot: ModelSnapshot, entityName: string, relationName: string): Found<Side> {
  const entity = findEntity(snapshot, entityName);
  if (!entity.ok) return entity;
  const relation = findRelation(entity.value, relationName);
  return relation.ok ? { ok: true, value: { entity: entity.value, relation: relation.value } } : relation;
}

function inverseOf(snapshot: ModelSnapshot, { entity, relation }: Side): Side | undefined {
  const target = snapshot.entities.find(item => item.id === relation.mappedEntityId);
  const inverse = target?.relations.find(item => item.id === relation.mappedPropertyId);
  if (!target || inverse?.mappedPropertyId !== relation.id || inverse.mappedEntityId !== entity.id) return undefined;
  return { entity: target, relation: inverse };
}

/** 把要删的关系与其逆关系配成对；两端都被列出时只算一对。 */
function pairUp(snapshot: ModelSnapshot, sides: readonly Side[]): Side[][] {
  const pairs: Side[][] = [];
  const seen = new Set<string>();
  for (const side of sides) {
    if (seen.has(side.relation.id)) continue;
    const pair = [side, inverseOf(snapshot, side)].filter((item): item is Side => item !== undefined);
    pair.forEach(item => seen.add(item.relation.id));
    pairs.push(pair);
  }
  return pairs;
}

/** 删除关系，并删除仍指回它的逆关系。 */
export function unlinkEntitiesTool(deps: ToolDeps) {
  return tool({
    description: '删除实体之间的关系。只需给出任意一端，指回它的另一端会一起删除。',
    inputSchema: z.object({
      links: z.array(z.object({ entity: z.string(), relation: z.string().describe('关系名') })).min(1)
    }),
    execute: ({ links }): ModelToolOutput => {
      const snapshot = deps.draft.get();
      const found = collect(links.map(link => findSide(snapshot, link.entity, link.relation)));
      if (!found.ok) return failed([found.error]);
      const pairs = pairUp(snapshot, found.value);
      const ops = pairs
        .flat()
        .map((side): ModelOp => ({ op: 'removeRelation', entityId: side.entity.id, relationId: side.relation.id }));
      const labels = pairs.map(pair => pair.map(side => `${side.entity.name}.${side.relation.name}`).join(' ⇄ '));
      return commit(deps, ops, `已删除关系 ${labels.join('、')}`);
    },
    toModelOutput: ({ output }) => modelText(output)
  });
}
