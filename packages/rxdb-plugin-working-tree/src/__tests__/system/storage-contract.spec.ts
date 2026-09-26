/**
 * @fileoverview T007 红测试：两条「独立完整复制」存储契约的可执行门禁。
 *
 * @remarks
 * 契约见 `git show f9528e8f:specs/001-working-tree-commits/data-model.md` §3，源头是 spec.md 的两条硬裁决：
 * `WorkingTreeEntry` 独立完整复制，不复用也不只引用 `RxDBChange`；`CommitChangeSet`
 * 复制完整不可变恢复数据。
 *
 * §3 把它们翻译成一条**静态**断言：`rxdb_commit_change_set` 与 `rxdb_working_tree_entry`
 * 的 `relations` 中不得出现 `mappedEntity: 'RxDBChange'`。
 *
 * 为什么门禁必须是静态的：指向 `rxdb_change` 的外键在功能测试里**完全看不出来**——
 * 数据读得出、patch 也对，直到 `cleanupExpired()` 按保留策略删掉那批 change 行为止。
 * 那一刻已提交的历史会随之损坏，而损坏发生在删除那一侧，追不回这里。
 *
 * 顺带断言 `sourceChangeId` 只是诊断列：它是标量而非关系，因此**不能**出现在 `relations`
 * 里，也不能出现在 `foreignKeys` 里（data-model.md §2.7：「无外键约束且只用于诊断」）。
 */

import { getEntityMetadata, RxDBChange, type EntityType } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { CommitChangeSet } from '../../commit/commit-change-set.entity.js';
import { WorkingTreeEntry } from '../../working-tree/working-tree-entry.entity.js';

const CHANGE_ENTITY_NAME = getEntityMetadata(RxDBChange).name;

/** §3 点名的两张表——契约只约束这两张，不扩大到全部新表。 */
const GUARDED: readonly (readonly [string, EntityType])[] = [
  ['rxdb_commit_change_set', CommitChangeSet],
  ['rxdb_working_tree_entry', WorkingTreeEntry]
];

describe('独立完整复制的存储契约', () => {
  it.each(GUARDED)('%s 的 relations 中不出现 mappedEntity: RxDBChange', (_tableName, EntityClass) => {
    const relations = getEntityMetadata(EntityClass).relations;
    expect(relations.map(relation => relation.mappedEntity)).not.toContain(CHANGE_ENTITY_NAME);
  });

  it.each(GUARDED)('%s 不对 rxdb_change 建外键', (_tableName, EntityClass) => {
    const metadata = getEntityMetadata(EntityClass);
    const changeTableName = getEntityMetadata(RxDBChange).tableName;
    // foreignKeys 是 relations 之外的第二条建约束路径，只堵前者等于没堵。
    // 整表一次序列化，而不是 for 循环里逐条断言：两张表今天的 foreignKeys 都是空的，
    // 循环体零次执行，于是断言写错了（属性名拼错、比对的是另一张表）也照样绿。
    // 先确认读到的确实是一个数组——元数据字段改名会在这一句上红，而不是悄悄退化成空断言。
    expect(Array.isArray(metadata.foreignKeys)).toBe(true);
    const serialized = JSON.stringify(metadata.foreignKeys);
    expect(serialized).not.toContain(changeTableName);
    expect(serialized).not.toContain(CHANGE_ENTITY_NAME);
  });

  it('rxdb_working_tree_entry 自带 patch / inversePatch / fingerprint 三列', () => {
    const { propertyMap } = getEntityMetadata(WorkingTreeEntry);
    for (const name of ['patch', 'inversePatch', 'fingerprint']) {
      expect(propertyMap.has(name)).toBe(true);
    }
  });

  it('rxdb_commit_change_set 自带 patch / inversePatch 两列', () => {
    const { propertyMap } = getEntityMetadata(CommitChangeSet);
    for (const name of ['patch', 'inversePatch']) {
      expect(propertyMap.has(name)).toBe(true);
    }
  });

  it('sourceChangeId 是诊断标量，不是关系', () => {
    const metadata = getEntityMetadata(WorkingTreeEntry);
    expect(metadata.propertyMap.has('sourceChangeId')).toBe(true);
    expect(metadata.relationMap.has('sourceChangeId')).toBe(false);
  });
});
