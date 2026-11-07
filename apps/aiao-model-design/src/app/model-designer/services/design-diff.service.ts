import { useFindAll } from '@aiao/rxdb-angular';
import { Injectable } from '@angular/core';
import { DesignEntity, DesignProperty } from '../models/index.js';

/** 可参与实体级对比的最小字段集 */
interface EntityComparable {
  id: string;
  name: string;
}

/** 可参与属性级对比的最小字段集 */
interface PropertyComparable {
  id: string;
  name: string;
  propertyType: string;
  isRequired: boolean;
  isUnique: boolean;
  isNullable: boolean;
  isReadonly: boolean;
  isSortable: boolean;
  defaultValue: string | null;
  enumValues: string[] | null;
  displayName: string | null;
  columnName: string | null;
}

const COMPARABLE_PROPERTY_FIELDS: readonly (keyof PropertyComparable)[] = [
  'propertyType',
  'isRequired',
  'isUnique',
  'isNullable',
  'isReadonly',
  'isSortable',
  'defaultValue',
  'enumValues',
  'displayName',
  'columnName'
];

/** 一条实体对比结果（按 name 匹配，两侧设计互相独立，id 不可比） */
export interface EntityDiffEntry {
  name: string;
  entityIdA: string | null;
  entityIdB: string | null;
}

/** 两个模型设计下实体集合的对比结果 */
export interface EntitySetDiff {
  /** 仅存在于 B 中的实体 */
  added: EntityDiffEntry[];
  /** 仅存在于 A 中的实体 */
  removed: EntityDiffEntry[];
  /** 两侧都存在（按 name 匹配）的实体 */
  common: EntityDiffEntry[];
}

/** 一条属性对比结果 */
export interface PropertyDiffEntry {
  name: string;
  propertyIdA: string | null;
  propertyIdB: string | null;
  /** 两侧都存在时发生变化的字段名列表，新增/删除时为空数组 */
  changedFields: (keyof PropertyComparable)[];
}

/** 两个实体下属性集合的对比结果 */
export interface PropertySetDiff {
  /** 仅存在于 B 中的属性 */
  added: PropertyDiffEntry[];
  /** 仅存在于 A 中的属性 */
  removed: PropertyDiffEntry[];
  /** 两侧都存在但字段不同的属性 */
  changed: PropertyDiffEntry[];
  /** 两侧都存在且字段相同的属性 */
  unchanged: PropertyDiffEntry[];
}

function toPropertyComparable(p: DesignProperty): PropertyComparable {
  return {
    id: p.id,
    name: p.name,
    propertyType: p.propertyType,
    isRequired: p.isRequired,
    isUnique: p.isUnique,
    isNullable: p.isNullable,
    isReadonly: p.isReadonly,
    isSortable: p.isSortable,
    defaultValue: p.defaultValue ?? null,
    enumValues: p.enumValues ?? null,
    displayName: p.displayName ?? null,
    columnName: p.columnName ?? null
  };
}

function fieldsEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return a === b;
}

/**
 * 按 name 对比两个实体数组，纯函数，不依赖 RxDB。
 *
 * 用于对比两个独立模型设计下的实体集合——两侧 id 互不相关，只能按 name 匹配。
 */
export function diffEntityArrays(a: readonly EntityComparable[], b: readonly EntityComparable[]): EntitySetDiff {
  const aByName = new Map(a.map(e => [e.name, e]));
  const bByName = new Map(b.map(e => [e.name, e]));

  const removed: EntityDiffEntry[] = [];
  const common: EntityDiffEntry[] = [];
  for (const entity of a) {
    const match = bByName.get(entity.name);
    if (match) {
      common.push({ name: entity.name, entityIdA: entity.id, entityIdB: match.id });
    } else {
      removed.push({ name: entity.name, entityIdA: entity.id, entityIdB: null });
    }
  }

  const added: EntityDiffEntry[] = [];
  for (const entity of b) {
    if (!aByName.has(entity.name)) {
      added.push({ name: entity.name, entityIdA: null, entityIdB: entity.id });
    }
  }

  return { added, removed, common };
}

/**
 * 按 name 对比两个属性数组，纯函数，不依赖 RxDB。
 *
 * 匹配到的属性会逐字段比较 {@link COMPARABLE_PROPERTY_FIELDS}，判定为 changed 或 unchanged。
 */
export function diffPropertyArrays(
  a: readonly PropertyComparable[],
  b: readonly PropertyComparable[]
): PropertySetDiff {
  const aByName = new Map(a.map(p => [p.name, p]));
  const bByName = new Map(b.map(p => [p.name, p]));

  const removed: PropertyDiffEntry[] = [];
  const changed: PropertyDiffEntry[] = [];
  const unchanged: PropertyDiffEntry[] = [];
  for (const prop of a) {
    const match = bByName.get(prop.name);
    if (!match) {
      removed.push({ name: prop.name, propertyIdA: prop.id, propertyIdB: null, changedFields: [] });
      continue;
    }
    const changedFields = COMPARABLE_PROPERTY_FIELDS.filter(field => !fieldsEqual(prop[field], match[field]));
    const entry: PropertyDiffEntry = { name: prop.name, propertyIdA: prop.id, propertyIdB: match.id, changedFields };
    (changedFields.length > 0 ? changed : unchanged).push(entry);
  }

  const added: PropertyDiffEntry[] = [];
  for (const prop of b) {
    if (!aByName.has(prop.name)) {
      added.push({ name: prop.name, propertyIdA: null, propertyIdB: prop.id, changedFields: [] });
    }
  }

  return { added, removed, changed, unchanged };
}

/**
 * 模型设计对比服务
 *
 * 对比两个（可能互不相关的）模型设计下的实体与属性集合，仅做属性集合级别对比，
 * 不做关系（DesignRelation）级别 diff。
 */
@Injectable()
export class DesignDiffService {
  readonly #allEntities = useFindAll(DesignEntity, { where: { combinator: 'and', rules: [] } }).value;
  readonly #allProperties = useFindAll(DesignProperty, { where: { combinator: 'and', rules: [] } }).value;

  /** 对比两个模型设计下的实体集合 */
  diffEntitySets(designIdA: string, designIdB: string): EntitySetDiff {
    const a = this.#allEntities().filter(e => e.modelDesignId === designIdA);
    const b = this.#allEntities().filter(e => e.modelDesignId === designIdB);
    return diffEntityArrays(a, b);
  }

  /** 对比两个实体下的属性集合 */
  diffPropertySets(entityIdA: string, entityIdB: string): PropertySetDiff {
    const a = this.#allProperties()
      .filter(p => p.designEntityId === entityIdA)
      .map(toPropertyComparable);
    const b = this.#allProperties()
      .filter(p => p.designEntityId === entityIdB)
      .map(toPropertyComparable);
    return diffPropertyArrays(a, b);
  }
}
