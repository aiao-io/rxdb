import { describe, expect, it } from 'vitest';
import type {
  EdgeFilterOptions,
  EdgeFilterOptionsFull,
  EdgeFilterOptionsWithProperties,
  EdgeFilterOptionsWithWeight,
  EdgeInfo,
  EdgeInfoFull,
  EdgeInfoWithProperties,
  EdgeInfoWithWeight,
  GraphEdgeInfoType,
  GraphEdgeProperties,
  GraphEdgePropertiesRecord
} from '../graph-repository.interface.js';

/**
 * `weight` / `properties` 都是**可选**属性，`T extends EdgeFilterOptionsFull<infer P>`
 * 因此对任意对象类型都成立——条件类型的第一个分支恒命中，后三个分支永远不可达。
 * 无权图上 `edge.weight` 被标成必有的 `number`，实际运行时是 `undefined`。
 */
type Exact<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const expectExact = <T extends true>(value: T): T => value;

describe('边过滤条件的条件类型判别', () => {
  it('GraphEdgeInfoType 按 weight/properties 的有无精确判别', () => {
    expect(expectExact<Exact<GraphEdgeInfoType<EdgeFilterOptions>, EdgeInfo>>(true)).toBe(true);
    expect(expectExact<Exact<GraphEdgeInfoType<EdgeFilterOptionsWithWeight>, EdgeInfoWithWeight>>(true)).toBe(true);
    expect(
      expectExact<
        Exact<GraphEdgeInfoType<EdgeFilterOptionsWithProperties>, EdgeInfoWithProperties<GraphEdgePropertiesRecord>>
      >(true)
    ).toBe(true);
    expect(
      expectExact<Exact<GraphEdgeInfoType<EdgeFilterOptionsFull>, EdgeInfoFull<GraphEdgePropertiesRecord>>>(true)
    ).toBe(true);
  });

  it('启用的边字段在合法空值写入后以 null 暴露', () => {
    expect(expectExact<Exact<EdgeInfoWithWeight['weight'], number | null>>(true)).toBe(true);
    expect(
      expectExact<
        Exact<EdgeInfoWithProperties<GraphEdgePropertiesRecord>['properties'], GraphEdgePropertiesRecord | null>
      >(true)
    ).toBe(true);
  });

  it('GraphEdgeProperties 在无属性过滤上求值为 never', () => {
    expect(expectExact<Exact<GraphEdgeProperties<EdgeFilterOptions>, never>>(true)).toBe(true);
    expect(expectExact<Exact<GraphEdgeProperties<EdgeFilterOptionsWithWeight>, never>>(true)).toBe(true);
    expect(
      expectExact<Exact<GraphEdgeProperties<EdgeFilterOptionsWithProperties>, GraphEdgePropertiesRecord>>(true)
    ).toBe(true);
    expect(expectExact<Exact<GraphEdgeProperties<EdgeFilterOptionsFull>, GraphEdgePropertiesRecord>>(true)).toBe(true);
  });

  it('自定义属性类型在两个条件类型里都被保留', () => {
    interface Meta {
      category: string;
    }
    expect(expectExact<Exact<GraphEdgeProperties<EdgeFilterOptionsWithProperties<Meta>>, Meta>>(true)).toBe(true);
    expect(expectExact<Exact<GraphEdgeInfoType<EdgeFilterOptionsFull<Meta>>, EdgeInfoFull<Meta>>>(true)).toBe(true);
  });
});
