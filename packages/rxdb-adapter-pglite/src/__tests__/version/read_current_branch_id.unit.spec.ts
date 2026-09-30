import type { EntityMetadata, EntityPropertyMetadata } from '@aiao/rxdb';
import type { Results } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

import { RxdbAdapterPGliteError } from '../../pglite.utils.js';
import {
  readCurrentBranchId,
  resolveBranchColumns,
  type PGliteRowReader
} from '../../version/read_current_branch_id.js';

/**
 * 只带指定属性的分支元数据替身。
 *
 * @param names - 要出现在 `propertyMap` 里的属性名
 * @returns 一份只够 {@link resolveBranchColumns} 读的最小元数据
 */
const metadataWith = (names: readonly string[]): EntityMetadata =>
  ({
    propertyMap: new Map<string, EntityPropertyMetadata>(
      // 替身只填 `resolveBranchColumns` 读的那两个字段；补齐 `EntityPropertyMetadata`
      // 的全部成员只会让这份夹具跟着无关的元数据形状漂移，所以在这一层断言。
      names.map(name => [
        name,
        { name, columnName: name === 'activated' ? 'is_activated' : name } as unknown as EntityPropertyMetadata
      ])
    )
  }) as unknown as EntityMetadata;

/**
 * 按 SQL 片段回答的最小行读取替身。
 *
 * @param answers - `[SQL 里要出现的片段, 这一问返回的行]` 的清单，按序匹配第一条命中的
 * @returns 一个 {@link PGliteRowReader}
 */
const reader = (answers: readonly (readonly [string, readonly Record<string, unknown>[]])[]): PGliteRowReader => ({
  query: async <T = Record<string, unknown>>(sql: string): Promise<Results<T>> => {
    const hit = answers.find(([fragment]) => sql.includes(fragment));
    return { rows: (hit?.[1] ?? []) as T[], fields: [], affectedRows: 0 } as Results<T>;
  }
});

describe('resolveBranchColumns', () => {
  it('元数据缺 `activated` 属性时抛，而不是退回字面量 `activated`', () => {
    // 猜一个默认列名等于在元数据已经对不上的时候照样把 SQL 发下去：猜对了什么都没发生，
    // 猜错了拿回来的是 PG 的 `column does not exist`——把「元数据装配坏了」伪装成「SQL 写错了」。
    expect(() => resolveBranchColumns(metadataWith(['id']))).toThrow(RxdbAdapterPGliteError);
  });

  it('元数据缺 `id` 属性时同样抛', () => {
    expect(() => resolveBranchColumns(metadataWith(['activated']))).toThrow(RxdbAdapterPGliteError);
  });

  it('两个属性齐备时取的是元数据里的物理列名，不是属性名', () => {
    // 守卫写成无条件抛的话这条会红；`activated` 的列名刻意与属性名不同，
    // 好让「其实读的是硬编码字面量」这种写法在这里现形。
    expect(resolveBranchColumns(metadataWith(['id', 'activated']))).toEqual({
      idColumnName: 'id',
      activatedColumnName: 'is_activated'
    });
  });
});

describe('readCurrentBranchId', () => {
  it('优先返回 `activated` 为真的那一条', async () => {
    await expect(readCurrentBranchId(reader([['IS TRUE', [{ id: 'feature' }]]]))).resolves.toBe('feature');
  });

  it('没有活跃分支时退到 `main`', async () => {
    await expect(readCurrentBranchId(reader([['= $1::text', [{ id: 'main' }]]]))).resolves.toBe('main');
  });

  it('两问都空时抛，让事务回滚', async () => {
    // 读不到分支就无法重建触发器；吞掉它等于提交一个永久没有触发器的库。
    await expect(readCurrentBranchId(reader([]))).rejects.toThrow(RxdbAdapterPGliteError);
  });
});
