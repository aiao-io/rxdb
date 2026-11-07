import type { AiEntityContext } from '../types/ai-schemas';

/** 全量发送阈值 */
const FULL_THRESHOLD = 20;

/** 无选中时发送的最近实体数 */
const RECENT_COUNT = 5;

/** 最大实体详情数 */
const MAX_ENTITIES = 50;

/** 最大实体名数 */
const MAX_ENTITY_NAMES = 200;

/**
 * AI 上下文构建服务
 *
 * 为不同 AI 端点提供裁剪后的模型上下文，控制 token 开销。
 */
export class AiContextService {
  readonly #entities: AiEntityContext[];
  readonly #selectedEntityId: string | undefined;

  constructor(entities: AiEntityContext[], selectedEntityId?: string) {
    this.#entities = entities;
    this.#selectedEntityId = selectedEntityId;
  }

  /**
   * 构建 /model/generate 端点的上下文
   *
   * ≤20 全量；>20 有选中→选中+关联+摘要；>20 无选中→names+最近5个
   */
  buildGenerateContext(selectedEntityId?: string): { entityNames: string[]; entities?: AiEntityContext[] } {
    const all = this.#entities;
    if (all.length === 0) return { entityNames: [] };

    const entityNames = all.map(e => e.name).slice(0, MAX_ENTITY_NAMES);

    if (all.length <= FULL_THRESHOLD) {
      return { entityNames, entities: all };
    }

    const selId = selectedEntityId ?? this.#selectedEntityId;
    if (selId) {
      const selected = all.find(e => e.name === selId || e.id === selId);
      if (selected) {
        const targetIds = new Set(selected.relations.map(r => r.mappedEntityId));
        const related = all.filter(e => targetIds.has(e.id) && e.id !== selected.id);
        const entities = [selected, ...related].slice(0, MAX_ENTITIES);
        return { entityNames, entities };
      }
    }

    // 无选中：返回最近 5 个
    const recent = all.slice(-RECENT_COUNT);
    return { entityNames, entities: recent };
  }

  /**
   * 构建 /model/validate 端点的上下文
   *
   * 返回完整模型，包含名称、命名空间和全部实体列表。
   */
  buildValidateContext(
    name: string,
    namespace: string
  ): { name: string; namespace: string; entities: AiEntityContext[] } {
    return { name, namespace, entities: this.#entities };
  }

  /**
   * 构建 /model/chat 端点的上下文
   *
   * 选中实体置顶 + 关联实体独立字段
   */
  buildChatContext(selectedEntityId?: string): {
    entityNames: string[];
    selectedEntity?: AiEntityContext;
    relatedEntities?: AiEntityContext[];
  } {
    const all = this.#entities;
    if (all.length === 0) return { entityNames: [] };

    const entityNames = all.map(e => e.name).slice(0, MAX_ENTITY_NAMES);

    const selId = selectedEntityId ?? this.#selectedEntityId;
    if (!selId) return { entityNames };

    const selectedEntity = all.find(e => e.name === selId || e.id === selId);
    if (!selectedEntity) return { entityNames };

    const targetIds = new Set(selectedEntity.relations.map(r => r.mappedEntityId));
    const relatedEntities = all.filter(e => targetIds.has(e.id) && e.id !== selectedEntity.id);

    return { entityNames, selectedEntity, relatedEntities };
  }
}
