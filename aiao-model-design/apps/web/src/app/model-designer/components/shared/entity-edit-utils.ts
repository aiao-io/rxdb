/**
 * 实体编辑工具函数
 * 提供继承属性/关系构建、快照等辅助功能
 */
import { computed, type Signal } from '@angular/core';
import { getInheritedProperties, isInheritedProperty, type ExtendsOption } from '../../constants';
import type { DesignProperty, DesignRelation } from '../../models/index.js';

export function buildTargetRelationsByEntity(allRelations: Signal<DesignRelation[]>) {
  return computed(() => {
    const map = new Map<string, DesignRelation[]>();
    for (const r of allRelations()) {
      const list = map.get(r.designEntityId);
      if (list) list.push(r);
      else map.set(r.designEntityId, [r]);
    }
    return map;
  });
}

export function targetRelationsOf(
  targetRelationsByEntity: Signal<Map<string, DesignRelation[]>>,
  entityId: string
): DesignRelation[] {
  return targetRelationsByEntity().get(entityId) ?? [];
}

export function buildInheritedProperties(extendsBase: Signal<string>) {
  return computed(() => getInheritedProperties(extendsBase() as ExtendsOption));
}

export function buildInheritedRelations(extendsBase: Signal<string>) {
  const inherited = buildInheritedProperties(extendsBase);
  return computed(() => inherited().filter(p => p.category === 'relation'));
}

/**
 * Shallow-clone an entity preserving prototype chain.
 * Guarantees a new reference so Angular input signals detect changes
 * even when RxDB mutates the original object in-place (e.g. undo/redo).
 *
 * **Warning**: This is a shallow clone only — nested objects/arrays are shared
 * by reference. Do not use on entities with mutable nested properties.
 */
export function snapshotEntity<T extends object>(entity: T): T {
  return Object.assign(Object.create(Object.getPrototypeOf(entity) as object), entity) as T;
}

export function buildCustomProperties(properties: Signal<DesignProperty[]>) {
  return computed(() =>
    properties()
      .filter(p => !isInheritedProperty(p.name))
      .map(snapshotEntity)
  );
}
