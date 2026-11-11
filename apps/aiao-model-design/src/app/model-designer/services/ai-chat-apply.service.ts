import { inject, Injectable } from '@angular/core';

import type { ChatChange, ChatChangeProposal } from '../types/ai-schemas';
import { DesignEntityService } from './design-entity.service';
import { DesignIndexService } from './design-index.service';
import { DesignPropertyService } from './design-property.service';
import { DesignRelationService } from './design-relation.service';

type ProposalIdMap = Map<string, string>;
type ProposalEntityMap = Map<string, { id: string; name: string }>;

interface PendingRelationLink {
  relationId: string;
  mappedPropertyId: string;
}

/**
 * AI 对话变更提案应用服务
 *
 * 接收 ChatChangeProposal → 按 action 分发到 RxDB 操作。
 * 对 details 做 runtime type narrowing，不合规时 skip + console.warn。
 */
@Injectable()
export class AiChatApplyService {
  readonly #entityService = inject(DesignEntityService);
  readonly #propertyService = inject(DesignPropertyService);
  readonly #relationService = inject(DesignRelationService);
  readonly #indexService = inject(DesignIndexService);

  async applyProposal(proposal: ChatChangeProposal): Promise<void> {
    const idMap: ProposalIdMap = new Map();
    const createdEntities: ProposalEntityMap = new Map();
    const pendingRelationLinks: PendingRelationLink[] = [];
    for (const change of proposal.changes) {
      await this.#applyChange(change, idMap, createdEntities, pendingRelationLinks);
    }
    for (const link of pendingRelationLinks) {
      await this.#relationService.update(link.relationId, {
        mappedPropertyId: this.#resolveId(link.mappedPropertyId, idMap)
      });
    }
  }

  async #applyChange(
    change: ChatChange,
    idMap: ProposalIdMap,
    createdEntities: ProposalEntityMap,
    pendingRelationLinks: PendingRelationLink[]
  ): Promise<void> {
    const { action, entityId, entityName, details } = change;

    if (action === 'addEntity') {
      const entity = await this.#entityService.create(entityName);
      this.#rememberId(entityId, entity.id, idMap);
      createdEntities.set(entityId, { id: entity.id, name: entityName });
      if (typeof details['displayName'] === 'string') {
        await this.#entityService.update(entity.id, { displayName: details['displayName'] });
      }
      return;
    }

    // 优先通过 entityId 查找，回退到 entityName
    const resolvedEntityId = this.#resolveId(entityId, idMap);
    const entity =
      this.#entityService.entities().find(e => e.id === resolvedEntityId) ??
      [...createdEntities.values()].find(e => e.id === resolvedEntityId || e.name === entityName) ??
      this.#entityService.entities().find(e => e.name === entityName);
    if (!entity) {
      console.warn('[AiChatApply] Entity not found:', entityId, entityName, action);
      return;
    }

    const handlers: Record<string, () => Promise<void>> = {
      modifyEntity: () => this.#handleModifyEntity(entity.id, details),
      removeEntity: () => this.#entityService.remove(entity.id),
      addProperty: () => this.#handleAddProperty(entity.id, details, idMap),
      modifyProperty: () => this.#handleModifyProperty(entity.id, details, idMap),
      removeProperty: () => this.#handleRemoveProperty(entity.id, details, idMap),
      addRelation: () =>
        this.#handleAddRelation(entity.id, details, idMap, createdEntities, pendingRelationLinks),
      modifyRelation: () => this.#handleModifyRelation(entity.id, details, idMap),
      removeRelation: () => this.#handleRemoveRelation(entity.id, details, idMap),
      addIndex: () => this.#handleAddIndex(entity.id, details, idMap),
      removeIndex: () => this.#handleRemoveIndex(entity.id, details, idMap)
    };

    const handler = handlers[action];
    if (handler) await handler();
  }

  async #handleModifyEntity(entityId: string, details: Record<string, unknown>): Promise<void> {
    const changes: Record<string, unknown> = {};
    if (typeof details['name'] === 'string') changes['name'] = details['name'];
    if (typeof details['displayName'] === 'string') changes['displayName'] = details['displayName'];
    if (Object.keys(changes).length > 0) {
      await this.#entityService.update(entityId, changes as never);
    }
  }

  async #handleAddProperty(entityId: string, details: Record<string, unknown>, idMap: ProposalIdMap): Promise<void> {
    if (typeof details['name'] !== 'string' || typeof details['propertyType'] !== 'string') {
      console.warn('[AiChatApply] Invalid addProperty details:', details);
      return;
    }
    const result = await this.#propertyService.create(
      entityId,
      details['name'] as string,
      details['propertyType'] as never
    );
    if (typeof details['id'] === 'string') this.#rememberId(details['id'], result.id, idMap);
    const attrs: Record<string, unknown> = {};
    for (const key of ['isRequired', 'isNullable', 'isUnique'] as const) {
      if (typeof details[key] === 'boolean') attrs[key] = details[key];
    }
    if (typeof details['defaultValue'] === 'string') attrs['defaultValue'] = details['defaultValue'];
    if (Array.isArray(details['enumValues'])) attrs['enumValues'] = details['enumValues'];
    if (typeof details['displayName'] === 'string') attrs['displayName'] = details['displayName'];
    if (Object.keys(attrs).length > 0) {
      await this.#propertyService.update(result.id, attrs as never);
    }
  }

  async #handleModifyProperty(entityId: string, details: Record<string, unknown>, idMap: ProposalIdMap): Promise<void> {
    const props = this.#propertyService.propertiesOf(entityId)();
    // 优先通过 id 查找，回退到 name
    const prop =
      (typeof details['id'] === 'string' ? props.find(p => p.id === this.#resolveId(details['id'], idMap)) : undefined) ??
      (typeof details['name'] === 'string' ? props.find(p => p.name === details['name']) : undefined);
    if (!prop) {
      console.warn('[AiChatApply] Property not found:', details['id'] ?? details['name']);
      return;
    }
    const changes = Object.fromEntries(Object.entries(details).filter(([k]) => k !== 'id' && k !== 'name'));
    if (Object.keys(changes).length > 0) {
      await this.#propertyService.update(prop.id, changes as never);
    }
  }

  async #handleRemoveProperty(entityId: string, details: Record<string, unknown>, idMap: ProposalIdMap): Promise<void> {
    const props = this.#propertyService.propertiesOf(entityId)();
    const prop =
      (typeof details['id'] === 'string' ? props.find(p => p.id === this.#resolveId(details['id'], idMap)) : undefined) ??
      (typeof details['name'] === 'string' ? props.find(p => p.name === details['name']) : undefined);
    if (!prop) {
      console.warn('[AiChatApply] Property not found for removal:', details['id'] ?? details['name']);
      return;
    }
    await this.#propertyService.remove(prop.id);
  }

  async #handleAddRelation(
    entityId: string,
    details: Record<string, unknown>,
    idMap: ProposalIdMap,
    createdEntities: ProposalEntityMap,
    pendingRelationLinks: PendingRelationLink[]
  ): Promise<void> {
    if (typeof details['relationKind'] !== 'string') {
      console.warn('[AiChatApply] Invalid addRelation details:', details);
      return;
    }
    // 优先通过 mappedEntityId（UUID）查找目标实体，回退到 targetEntity（name）
    const targetId = typeof details['mappedEntityId'] === 'string' ? this.#resolveId(details['mappedEntityId'], idMap) : undefined;
    const target =
      (targetId ?
        this.#entityService.entities().find(e => e.id === targetId) ??
        [...createdEntities.values()].find(e => e.id === targetId)
      : undefined) ??
      (typeof details['targetEntity'] === 'string' ?
        this.#entityService.entities().find(e => e.name === details['targetEntity'])
      : undefined);
    if (!target) {
      console.warn('[AiChatApply] Target entity not found:', details['mappedEntityId'] ?? details['targetEntity']);
      return;
    }
    const relation = await this.#relationService.create(
      entityId as never,
      target.id as never,
      details['relationKind'] as never
    );
    if (typeof details['id'] === 'string') this.#rememberId(details['id'], relation.id, idMap);
    if (typeof details['mappedPropertyId'] === 'string')
      pendingRelationLinks.push({ relationId: relation.id, mappedPropertyId: details['mappedPropertyId'] });
    if (typeof details['name'] === 'string') {
      await this.#relationService.update(relation.id, { name: details['name'] as string });
    }
    if (typeof details['onDeleteAction'] === 'string') {
      await this.#relationService.update(relation.id, { onDeleteAction: details['onDeleteAction'] as string });
    }
  }

  async #handleModifyRelation(entityId: string, details: Record<string, unknown>, idMap: ProposalIdMap): Promise<void> {
    const relations = this.#relationService.relationsOf(entityId)();
    // 优先通过 id 查找，回退到 name
    const rel =
      (typeof details['id'] === 'string' ? relations.find(r => r.id === this.#resolveId(details['id'], idMap)) : undefined) ??
      (typeof details['name'] === 'string' ? relations.find(r => r.name === details['name']) : undefined);
    if (!rel) {
      console.warn('[AiChatApply] Relation not found:', details['id'] ?? details['name']);
      return;
    }
    const changes = Object.fromEntries(
      Object.entries(details)
        .filter(([k]) => k !== 'id' && k !== 'name')
        .map(([key, value]) => [key, key === 'mappedEntityId' || key === 'mappedPropertyId' ? this.#resolveId(value, idMap) : value])
    );
    if (Object.keys(changes).length > 0) {
      await this.#relationService.update(rel.id, changes as never);
    }
  }

  async #handleRemoveRelation(entityId: string, details: Record<string, unknown>, idMap: ProposalIdMap): Promise<void> {
    const relations = this.#relationService.relationsOf(entityId)();
    const rel =
      (typeof details['id'] === 'string' ? relations.find(r => r.id === this.#resolveId(details['id'], idMap)) : undefined) ??
      (typeof details['name'] === 'string' ? relations.find(r => r.name === details['name']) : undefined);
    if (!rel) {
      console.warn('[AiChatApply] Relation not found for removal:', details['id'] ?? details['name']);
      return;
    }
    await this.#relationService.remove(rel.id);
  }

  async #handleAddIndex(entityId: string, details: Record<string, unknown>, idMap: ProposalIdMap): Promise<void> {
    if (typeof details['isUnique'] !== 'boolean') {
      console.warn('[AiChatApply] Invalid addIndex details:', details);
      return;
    }
    // 优先通过 propertyIds（UUID）解析，回退到 propertyNames（name）
    let ids: string[];
    if (Array.isArray(details['propertyIds'])) {
      ids = (details['propertyIds'] as string[]).map(id => this.#resolveId(id, idMap));
    } else if (Array.isArray(details['propertyNames'])) {
      const props = this.#propertyService.propertiesOf(entityId)();
      ids = (details['propertyNames'] as string[])
        .map(n => props.find(p => p.name === n)?.id)
        .filter(Boolean) as string[];
      if (ids.length !== (details['propertyNames'] as string[]).length) {
        console.warn('[AiChatApply] Some properties not resolved:', details['propertyNames']);
        return;
      }
    } else {
      console.warn('[AiChatApply] Invalid addIndex details: missing propertyIds or propertyNames', details);
      return;
    }
    const index = await this.#indexService.create(entityId, ids, details['isUnique'] as boolean);
    if (typeof details['id'] === 'string') this.#rememberId(details['id'], index.id, idMap);
  }

  async #handleRemoveIndex(entityId: string, details: Record<string, unknown>, idMap: ProposalIdMap): Promise<void> {
    const indexes = this.#indexService.indexesOf(entityId)();
    // 优先通过 id 查找
    if (typeof details['id'] === 'string') {
      const idx = indexes.find(i => i.id === this.#resolveId(details['id'], idMap));
      if (!idx) {
        console.warn('[AiChatApply] Index not found for removal:', details['id']);
        return;
      }
      await this.#indexService.remove(idx.id);
      return;
    }
    // 回退到 propertyNames 匹配
    if (!Array.isArray(details['propertyNames'])) {
      console.warn('[AiChatApply] Invalid removeIndex details:', details);
      return;
    }
    const props = this.#propertyService.propertiesOf(entityId)();
    const ids = (details['propertyNames'] as string[])
      .map(n => props.find(p => p.name === n)?.id)
      .filter(Boolean) as string[];
    const idx = indexes.find(
      i => i.propertyIds.length === ids.length && ids.every((id: string) => i.propertyIds.includes(id))
    );
    if (!idx) {
      console.warn('[AiChatApply] Index not found for removal:', details['propertyNames']);
      return;
    }
    await this.#indexService.remove(idx.id);
  }

  #resolveId(value: string, idMap: ProposalIdMap): string;
  #resolveId(value: unknown, idMap: ProposalIdMap): unknown;
  #resolveId(value: unknown, idMap: ProposalIdMap): unknown {
    return typeof value === 'string' ? (idMap.get(value) ?? value) : value;
  }

  #rememberId(sourceId: string, targetId: string, idMap: ProposalIdMap): void {
    idMap.set(sourceId, targetId);
  }
}
