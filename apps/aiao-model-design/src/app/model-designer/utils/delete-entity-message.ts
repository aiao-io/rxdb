import type { DesignRelation } from '../models/index.js';

/** 删除实体时收集的受影响关系摘要 */
export interface AffectedRelationSummary {
  id: string;
  name: string;
}

/**
 * 收集将随实体删除而清理的关系（出边 + 入边，按 id 去重）。
 */
export function collectAffectedRelations(
  entityIds: readonly string[],
  allRelations: readonly DesignRelation[],
  findByTargetEntity: (entityId: string) => readonly DesignRelation[]
): AffectedRelationSummary[] {
  if (entityIds.length === 0) return [];

  const byId = new Map<string, AffectedRelationSummary>();
  const entityIdSet = new Set(entityIds);

  for (const rel of allRelations) {
    if (entityIdSet.has(rel.designEntityId)) {
      byId.set(rel.id, { id: rel.id, name: rel.name });
    }
  }

  for (const entityId of entityIds) {
    for (const rel of findByTargetEntity(entityId)) {
      byId.set(rel.id, { id: rel.id, name: rel.name });
    }
  }

  return [...byId.values()];
}

/** 删除确认文案所需的 i18n 片段 */
export interface DeleteEntityMessageLabels {
  baseMessage: string;
  affectedPrefix: string;
  overflowSuffix: string;
  maxList?: number;
}

/**
 * 拼装删除实体确认消息：基础文案 + 受影响关系列表。
 */
export function formatDeleteEntityMessage(
  entityCount: number,
  relations: readonly AffectedRelationSummary[],
  labels: DeleteEntityMessageLabels
): string {
  const base = labels.baseMessage.replace('{count}', String(entityCount));
  if (relations.length === 0) return base;

  const maxList = labels.maxList ?? 8;
  const names = relations.map(r => r.name);
  const shown = names.slice(0, maxList);
  const rest = names.length - shown.length;
  let list = shown.join(', ');
  if (rest > 0) {
    list += labels.overflowSuffix.replace('{count}', String(rest));
  }
  return `${base}\n${labels.affectedPrefix.replace('{list}', list)}`;
}
