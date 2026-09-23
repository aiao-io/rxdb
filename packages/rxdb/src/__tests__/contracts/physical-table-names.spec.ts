/**
 * @fileoverview `RxDBAdapterLocalBase.physicalTableNames()` —— 物理表名解析的默认口径。
 *
 * @remarks
 * 这条能力存在的唯一理由是：**命名规则归写表的那个适配器所有**。在它之前，
 * `@aiao/rxdb-plugin-working-tree` 的版本化域自己按 `'$'` 把 sqlite 家族的规则重拼了一遍。
 * 抄来的规则不会因为原件改了而报错，它只会开始算错——而算错的后果是单向的：raw 写门禁认不出
 * 某张受版本控制的表，于是静默放行。现在域只登记适配器报上来的名字
 * （`VersionedDomainEntityInput.physicalTableNames`），一个字都不猜。
 *
 * 所以这个套件盯的是**默认值本身**：基类交出逻辑名，一个字都不猜。基类要是替后端猜一个
 * 「常见」形态（比如把 sqlite 家族的 `namespace$table` 写成默认），抄规则这件事就只是从
 * 插件挪到了核心，而且从此没有任何一个后端会因为忘了覆写而被发现。
 */

import { describe, expect, it } from 'vitest';

import { getEntityMetadata } from '../../rxdb-utils.js';
import { createTestDB } from '../fixtures/test-db-setup.js';
import { Post } from '../fixtures/test-entities.js';

describe('RxDBAdapterLocalBase.physicalTableNames', () => {
  it('默认口径就是逻辑表名本身', async () => {
    const { adapter, cleanup } = await createTestDB();
    expect(adapter.physicalTableNames(getEntityMetadata(Post))).toEqual(['Post']);
    await cleanup();
  });

  it('默认实现不替任何后端折叠命名空间', async () => {
    const { adapter, cleanup } = await createTestDB();
    const metadata = getEntityMetadata(Post);
    // sqlite 家族写的是 `public$Post`，PGlite 写的是 `"public"."Post"`。基类两个都不给：
    // 猜中一个等于把另一个后端的漏登记变成永远发现不了的那一种。
    expect(adapter.physicalTableNames(metadata)).not.toContain(`${metadata.namespace}$${metadata.tableName}`);
    await cleanup();
  });

  it('答案只由元数据决定，同一份元数据问多少次都一样', async () => {
    const { adapter, cleanup } = await createTestDB();
    const metadata = getEntityMetadata(Post);
    expect(adapter.physicalTableNames(metadata)).toEqual(adapter.physicalTableNames(metadata));
    await cleanup();
  });
});
