/**
 * @fileoverview 物理表名的**来源**：适配器说了算，版本化域只负责登记。
 *
 * @remarks
 * 在这组用例之前，域自己按 `'$'` 把 SQLite 家族的折叠规则重拼了一遍
 * （`addressableTableNames(namespace, tableName)`）。抄来的规则不会因为原件改了而报错，
 * 它只是开始算错——而算错的后果是**单向**的：raw 写门禁认不出某张受版本控制的表，
 * 于是静默放行一条绕过捕获的写，捕获链一无所知，冷重放从此对不上。
 *
 * 规则归写表的那一方所有：{@link RxDBAdapterLocalBase.physicalTableNames} 是唯一出处，
 * 而 sqlite-core 的覆写又是直接调它建表用的 `get_table_name_by_metadata()`。于是拼法改一次，
 * 三处一起变，没有第二份可抄。
 *
 * 这一组只钉两件事：**域一个名字都不猜**，以及**域拿不到名字时不往下走**。名字本身对不对
 * 是各后端自己的用例（core / sqlite-core / pglite 各一条）。
 */

import { RxDBError, SyncType } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { buildVersionedDomain, type VersionedDomainEntityInput } from '../../working-tree/versioned-domain.js';

const entity = (init: Partial<VersionedDomainEntityInput> & { entityName: string }): VersionedDomainEntityInput => ({
  namespace: 'public',
  physicalTableNames: [init.entityName.toLowerCase()],
  syncType: SyncType.Full,
  ...init
});

describe('版本化域登记的是适配器给的名字', () => {
  it('给几个登记几个，归一化成小写', () => {
    const domain = buildVersionedDomain([entity({ entityName: 'Post', physicalTableNames: ['post', 'Public$Post'] })]);

    expect([...domain.versionedTables].sort()).toEqual(['post', 'public$post']);
  });

  it('域不替任何后端折叠命名空间', () => {
    // 这一条是整次改动的**全部意义**：适配器只交逻辑名时，域就只认逻辑名。
    // 域自己拼一个 `public$post` 出来的话，规则就有了第二份——而第二份不会因为原件改了而报错。
    const domain = buildVersionedDomain([entity({ entityName: 'Post', physicalTableNames: ['post'] })]);

    expect(domain.versionedTables.has('public$post')).toBe(false);
    expect(domain.versionedTables.has('post')).toBe(true);
  });

  it('重复的名字只登记一次', () => {
    // 适配器把逻辑名连同折叠名一起交出来是常态（sqlite-core 就是这么写的）；
    // 不折叠的后端交出来的两份恰好同名，那不是错，只是没有第二种形态。
    const domain = buildVersionedDomain([entity({ entityName: 'Post', physicalTableNames: ['post', 'POST', 'post'] })]);

    expect([...domain.versionedTables]).toEqual(['post']);
  });

  it('一个名字都没给时抛，不当作「这张表没有物理形态」继续', () => {
    // fail-closed：空清单意味着这张 tracked 表在 `versionedTables` 里一个名字都没有，
    // 于是 raw 判定对它的每一条写都落 `out_of_domain` 放行——一条静默的捕获绕过。
    // 交空清单的适配器是坏的，但坏在它那一侧，这里的责任只是**不把它的空答案当成结论**。
    expect(() => buildVersionedDomain([entity({ entityName: 'Post', physicalTableNames: [] })])).toThrow(RxDBError);
  });

  it('全空白的名字与空清单同罪', () => {
    // `['']` 登记进去会让 `versionedTables` 里多一个永远命不中的空串，症状与空清单完全相同，
    // 却少了抛出的那一声。
    expect(() => buildVersionedDomain([entity({ entityName: 'Post', physicalTableNames: ['  '] })])).toThrow(RxDBError);
  });
});
