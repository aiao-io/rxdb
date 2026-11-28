/**
 * @fileoverview 依赖图测试的输入夹具
 *
 * 依赖图读的是元数据里**合并后**的两处：`relationMap`（含继承链上的关系）与 `foreignKeys`
 * （实体级复合外键）。既有用例按「自身 `relations` 数组」手写夹具，这里一次性转成真实元数据的形状，
 * 用例照旧只写关心的字段。
 */
import type { RelationKind } from '@aiao/rxdb';
import type { buildDependencyGraph } from '../../dependency-graph.js';

/** 手写夹具里的一条关系，`name` 缺省时按位置补一个 */
interface FixtureRelation {
  name?: string;
  kind: RelationKind;
  mappedEntity: string;
  mappedNamespace?: string;
  nullable?: boolean;
}

/** 手写夹具里的一个实体：只写依赖图读得到的字段，其余字段原样带过去 */
export interface FixtureGraphEntity {
  [field: string]: unknown;
  name: string;
  namespace: string;
  relations?: readonly FixtureRelation[];
  foreignKeys?: readonly { mappedEntity: string; mappedNamespace?: string; name?: string; properties?: string[] }[];
}

type GraphInput = Parameters<typeof buildDependencyGraph>[0][number];

/**
 * 把手写夹具转成 {@link buildDependencyGraph} 的输入
 *
 * @param entities - 按「自身 `relations` 数组」写的夹具
 * @returns `relationMap` / `foreignKeys` 齐全的元数据形状
 */
export function graphInputs(entities: readonly FixtureGraphEntity[]): GraphInput[] {
  return entities.map(({ relations = [], foreignKeys = [], ...rest }) => ({
    ...rest,
    name: rest.name,
    namespace: rest.namespace,
    relationMap: new Map(relations.map((relation, index) => [relation.name ?? `relation${index}`, relation])),
    foreignKeys
  }));
}
