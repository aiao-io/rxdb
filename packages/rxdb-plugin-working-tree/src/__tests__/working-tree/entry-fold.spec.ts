/**
 * @fileoverview T052 红测试：同一实体多次写入时工作树单元的折叠规则（data-model.md §2.6 / §2.7）。
 *
 * @remarks
 * 唯一约束是 `(branch, namespace, entity, entityId)`——同一分支同一实体至多一个未提交单元。
 * 所以「第二次写同一个实体」不是插入第二行，而是把新捕获折进已有那一行。折叠是**纯函数**：
 * 给它「已有单元（可能没有）+ 这次捕获」，它回答「留成什么样 / 要不要删掉」以及 `entryCount` 怎么动。
 *
 * 为什么这些断言值得写：
 *
 * 1. **`inversePatch` 取首次捕获值，这是整条规则里唯一不能错的一条。** 它取最新值的话，
 *    inverse 只能把实体退回**上一次中间态**，退不回 HEAD——而 discard 与 restore 的全部意义
 *    就是退回 HEAD。这个错误在单次写入下完全不可见，要连写三次同一个实体才暴露，
 *    所以用例里连写三次。
 * 2. **`patch` 取最新合成值，不是最新一次的 patch。** 直接覆盖的话，第一次改 `title`、
 *    第二次改 `body`，提交出去只有 `body`——第一次的编辑静默丢失。合成与覆盖在「两次改同一个
 *    字段」的用例下结果相同，因此必须用「两次改不同字段」来分辨。
 * 3. **INSERT 之后 DELETE 净无变化，删条目且 `entryCount` 递减。** 留一个 `delete` 单元的话，
 *    commit 会带着一条「删除一个 HEAD 里根本不存在的行」的记录，重放时要么报错要么无声跳过。
 * 4. **DELETE 之后 INSERT 不是净无变化。** 规则 2 的判据写在括号里：**该行在 HEAD 不存在**。
 *    先删后插说明这行在 HEAD 里**存在**，净效果是一次值变更，必须留下单元。两个方向共用
 *    同一个判据，写反了只有这一组用例会红。
 * 5. **不做值级归零。** 把 UPDATE 改回 HEAD 原值不会消解成无单元——折叠函数**拿不到 HEAD**
 *    （签名里没有），这是刻意的：值级归零要读 HEAD 投影，代价与 `diff()` 同阶，摊到每次
 *    `save()` 上会顶穿 SC-001。这是已知取舍，用例把它钉死，免得后来者当成 bug「修好」。
 * 6. **`origin` 取最新。** 一次本地编辑之后远端又同步了同一个实体，这个单元的来源就是
 *    `remote_sync`；`status()` / `diff()` 照常展示，不按来源豁免。
 * 7. **`entryCount` 与实际条目数的不变量。** 冗余列存在的理由是 `status()` 要常数时间回答
 *    「有没有未提交变更」。它与行数对不上时，冗余列就是第二份真相——而且是错的那份。
 *    折叠函数给出 `entryCountDelta`，用例跑一串写入把 delta 累加起来，与模拟存储里的活条目数
 *    逐步比对：这样「计数怎么变」由折叠这一处决定，调用方不必自己数。
 */

import { describe, expect, it } from 'vitest';
import {
  foldWorkingTreeEntry,
  type CapturedWrite,
  type FoldOutcome,
  type WorkingTreeEntryRow
} from '../../working-tree/write-entry.js';

const HEAD_TITLE = 'HEAD 里的标题';

const captured = (init: Partial<CapturedWrite> = {}): CapturedWrite => ({
  namespace: 'app',
  entity: 'Post',
  entityId: 'p1',
  operation: 'update',
  patch: { title: '改过的标题' },
  inversePatch: { title: HEAD_TITLE },
  fingerprint: 'fp-1',
  origin: 'local',
  unitId: 'unit-1',
  transactionId: null,
  sourceChangeId: null,
  ...init
});

/** 折叠并要求结果留下单元，顺带把「本该留下却被删了」变成读得懂的失败。 */
function rowAfter(existing: WorkingTreeEntryRow | undefined, write: CapturedWrite): WorkingTreeEntryRow {
  const outcome = foldWorkingTreeEntry(existing, write);
  if (outcome.kind === 'remove') expect.unreachable('期望折叠后仍留下单元，实际被判为净无变化并删除');
  return outcome.entry;
}

/** 连续折叠一串捕获，返回最终行；空串返回 `undefined`。 */
function foldAll(writes: readonly CapturedWrite[]): WorkingTreeEntryRow | undefined {
  let row: WorkingTreeEntryRow | undefined;
  for (const write of writes) {
    const outcome = foldWorkingTreeEntry(row, write);
    row = outcome.kind === 'remove' ? undefined : outcome.entry;
  }
  return row;
}

describe('首次捕获', () => {
  it('建新单元，entryCount +1', () => {
    const outcome = foldWorkingTreeEntry(undefined, captured());

    expect(outcome.kind).toBe('insert');
    expect(outcome.entryCountDelta).toBe(1);
  });

  it('原样带上身份、patch、inversePatch、origin 与指纹', () => {
    const row = rowAfter(undefined, captured());

    expect(row).toMatchObject({
      namespace: 'app',
      entity: 'Post',
      entityId: 'p1',
      operation: 'update',
      patch: { title: '改过的标题' },
      inversePatch: { title: HEAD_TITLE },
      fingerprint: 'fp-1',
      origin: 'local'
    });
  });

  it('首次就是 DELETE 时也建单元', () => {
    const outcome = foldWorkingTreeEntry(undefined, captured({ operation: 'delete', patch: null }));

    expect(outcome.kind).toBe('insert');
    expect(outcome.entryCountDelta).toBe(1);
  });
});

describe('规则 1 — patch 取最新合成值，inversePatch 保持首次捕获值', () => {
  it('改不同字段时两次编辑都在', () => {
    const row = foldAll([
      captured({ patch: { title: 'T1' }, inversePatch: { title: HEAD_TITLE } }),
      captured({ patch: { body: 'B1' }, inversePatch: { body: 'HEAD 里的正文' } })
    ]);

    expect(row?.patch).toEqual({ title: 'T1', body: 'B1' });
  });

  it('改同一字段时后写的赢', () => {
    const row = foldAll([captured({ patch: { title: 'T1' } }), captured({ patch: { title: 'T2' } })]);

    expect(row?.patch).toEqual({ title: 'T2' });
  });

  it('连写三次，inversePatch 仍是第一次捕获的那份', () => {
    // 三次是最小暴露长度：取最新值的实现在两次写入下看起来也「能退回去」，
    // 因为它退回的正好是第一次写完的状态。
    const row = foldAll([
      captured({ patch: { title: 'T1' }, inversePatch: { title: HEAD_TITLE } }),
      captured({ patch: { title: 'T2' }, inversePatch: { title: 'T1' } }),
      captured({ patch: { title: 'T3' }, inversePatch: { title: 'T2' } })
    ]);

    expect(row?.inversePatch).toEqual({ title: HEAD_TITLE });
    expect(row?.patch).toEqual({ title: 'T3' });
  });

  it('第二次写入不增计数', () => {
    const first = rowAfter(undefined, captured());
    const outcome = foldWorkingTreeEntry(first, captured({ patch: { body: 'B1' } }));

    expect(outcome.kind).toBe('update');
    expect(outcome.entryCountDelta).toBe(0);
  });

  it('新捕获的 inversePatch 补的是首次没覆盖到的字段时也不改写已有字段', () => {
    const row = foldAll([
      captured({ patch: { title: 'T1' }, inversePatch: { title: HEAD_TITLE } }),
      captured({ patch: { body: 'B1' }, inversePatch: { body: 'HEAD 里的正文', title: '不该覆盖' } })
    ]);

    expect(row?.inversePatch).toMatchObject({ title: HEAD_TITLE });
  });

  it('指纹取最新一次', () => {
    const row = foldAll([captured({ fingerprint: 'fp-1' }), captured({ fingerprint: 'fp-2' })]);

    expect(row?.fingerprint).toBe('fp-2');
  });
});

describe('规则 2 — INSERT 之后 DELETE 净无变化', () => {
  const insertThenDelete = (): FoldOutcome => {
    const inserted = rowAfter(undefined, captured({ operation: 'insert', inversePatch: null }));
    return foldWorkingTreeEntry(inserted, captured({ operation: 'delete', patch: null }));
  };

  it('删除条目而不是留一个 delete 单元', () => {
    expect(insertThenDelete().kind).toBe('remove');
  });

  it('entryCount 递减', () => {
    expect(insertThenDelete().entryCountDelta).toBe(-1);
  });

  it('INSERT 之后 UPDATE 仍是 INSERT（这行在 HEAD 里还是不存在）', () => {
    const row = foldAll([
      captured({ operation: 'insert', patch: { title: 'T1' }, inversePatch: null }),
      captured({ operation: 'update', patch: { title: 'T2' } })
    ]);

    expect(row?.operation).toBe('insert');
    expect(row?.patch).toEqual({ title: 'T2' });
  });

  it('INSERT → UPDATE → DELETE 同样净无变化', () => {
    // 中间隔一次 UPDATE 之后还能认出「这行是本次新建的」，靠的是折叠后的 operation 仍为
    // `insert`。把它折成 `update` 的实现在这一组会红，而单独的 INSERT→DELETE 用例发现不了。
    const row = rowAfter(undefined, captured({ operation: 'insert', patch: { title: 'T1' }, inversePatch: null }));
    const updated = rowAfter(row, captured({ operation: 'update', patch: { title: 'T2' } }));

    expect(foldWorkingTreeEntry(updated, captured({ operation: 'delete', patch: null })).kind).toBe('remove');
  });
});

describe('规则 2 的反向 — DELETE 之后 INSERT 不是净无变化', () => {
  it('留下单元，折成 update', () => {
    // 判据是规则 2 括号里那句「该行在 HEAD 不存在」。先删说明它**存在**，净效果是值变更。
    const deleted = rowAfter(undefined, captured({ operation: 'delete', patch: null }));
    const outcome = foldWorkingTreeEntry(deleted, captured({ operation: 'insert', patch: { title: '重建' } }));

    expect(outcome.kind).toBe('update');
    expect(outcome.entryCountDelta).toBe(0);
  });

  it('inversePatch 仍是删除前那份', () => {
    const row = foldAll([
      captured({ operation: 'delete', patch: null, inversePatch: { title: HEAD_TITLE } }),
      captured({ operation: 'insert', patch: { title: '重建' }, inversePatch: null })
    ]);

    expect(row?.inversePatch).toEqual({ title: HEAD_TITLE });
  });

  it('UPDATE 之后 DELETE 留下 delete 单元', () => {
    const updated = rowAfter(undefined, captured({ operation: 'update' }));
    const outcome = foldWorkingTreeEntry(updated, captured({ operation: 'delete', patch: null }));

    // 收窄而不是 `expect(outcome.kind).toBe('update')` 之后直接点 `.entry`：`remove` 那一支
    // 根本没有 `entry`，断言语句自己收窄才能同时是类型证明和用例断言。
    if (outcome.kind !== 'update') expect.unreachable(`期望折进已有单元，实际是 ${outcome.kind}`);

    expect(outcome.entry.operation).toBe('delete');
    expect(outcome.entry.inversePatch).toEqual({ title: HEAD_TITLE });
  });
});

describe('规则 3 — origin 取最新', () => {
  it('local 之后 remote_sync → remote_sync', () => {
    const row = foldAll([captured({ origin: 'local' }), captured({ origin: 'remote_sync' })]);

    expect(row?.origin).toBe('remote_sync');
  });

  it('remote_sync 之后 local → local', () => {
    const row = foldAll([captured({ origin: 'remote_sync' }), captured({ origin: 'local' })]);

    expect(row?.origin).toBe('local');
  });

  it('remote_sync 不被折叠豁免：它照样建单元、照样计数', () => {
    const outcome = foldWorkingTreeEntry(undefined, captured({ origin: 'remote_sync' }));

    expect(outcome.kind).toBe('insert');
    expect(outcome.entryCountDelta).toBe(1);
  });
});

describe('规则 4 — 不做值级归零', () => {
  it('把值改回 HEAD 原值仍留下单元', () => {
    const row = foldAll([
      captured({ patch: { title: 'T1' }, inversePatch: { title: HEAD_TITLE } }),
      captured({ patch: { title: HEAD_TITLE }, inversePatch: { title: 'T1' } })
    ]);

    expect(row).toBeDefined();
    expect(row?.patch).toEqual({ title: HEAD_TITLE });
  });

  it('patch 与 inversePatch 完全相等时也不消解', () => {
    // 这是「看起来最该归零」的形态：单元自己就写着「改前改后一样」。仍然不删——因为删不删
    // 要由 HEAD 说了算，而 patch/inversePatch 只是本地记录，它们相等不等于净变化为零。
    const row = foldAll([
      captured({ patch: { title: HEAD_TITLE }, inversePatch: { title: HEAD_TITLE } }),
      captured({ patch: { title: HEAD_TITLE }, inversePatch: { title: HEAD_TITLE } })
    ]);

    expect(row).toBeDefined();
  });

  it('唯一的删除条件是 INSERT 之后 DELETE', () => {
    const nonRemoving: readonly (readonly [CapturedWrite, CapturedWrite])[] = [
      [captured({ operation: 'update' }), captured({ operation: 'update' })],
      [captured({ operation: 'update' }), captured({ operation: 'delete', patch: null })],
      [captured({ operation: 'delete', patch: null }), captured({ operation: 'insert' })],
      [captured({ operation: 'insert', inversePatch: null }), captured({ operation: 'update' })]
    ];

    for (const [first, second] of nonRemoving) {
      const row = rowAfter(undefined, first);
      expect(foldWorkingTreeEntry(row, second).kind, `${first.operation} → ${second.operation}`).not.toBe('remove');
    }
  });
});

describe('entryCount 与实际条目数的不变量', () => {
  /** 一个最小的模拟存储：按唯一约束的键存活条目，并把折叠给出的 delta 累加起来。 */
  function replay(writes: readonly CapturedWrite[]) {
    const rows = new Map<string, WorkingTreeEntryRow>();
    let entryCount = 0;

    for (const write of writes) {
      const key = `${write.namespace}/${write.entity}/${write.entityId}`;
      const outcome = foldWorkingTreeEntry(rows.get(key), write);
      entryCount += outcome.entryCountDelta;
      if (outcome.kind === 'remove') rows.delete(key);
      else rows.set(key, outcome.entry);
    }

    return { entryCount, liveRows: rows.size };
  }

  it('单实体反复写入：计数始终等于活条目数', () => {
    const { entryCount, liveRows } = replay([
      captured({ patch: { title: 'T1' } }),
      captured({ patch: { title: 'T2' } }),
      captured({ patch: { title: 'T3' } })
    ]);

    expect(entryCount).toBe(liveRows);
    expect(entryCount).toBe(1);
  });

  it('多实体交错写入：计数等于去重后的实体数', () => {
    const { entryCount, liveRows } = replay([
      captured({ entityId: 'p1' }),
      captured({ entityId: 'p2' }),
      captured({ entityId: 'p1' }),
      captured({ entity: 'Comment', entityId: 'p1' })
    ]);

    expect(entryCount).toBe(liveRows);
    expect(entryCount).toBe(3);
  });

  it('净无变化的实体退出计数', () => {
    const { entryCount, liveRows } = replay([
      captured({ entityId: 'p1', operation: 'insert', inversePatch: null }),
      captured({ entityId: 'p2' }),
      captured({ entityId: 'p1', operation: 'delete', patch: null })
    ]);

    expect(entryCount).toBe(liveRows);
    expect(entryCount).toBe(1);
  });

  it('先减到零再重新写入，计数跟着回到 1', () => {
    // 递减写成「不小于零的饱和减」的实现在这里会停在 1 之后变成 2——因为它少减了一次。
    const { entryCount, liveRows } = replay([
      captured({ operation: 'insert', inversePatch: null }),
      captured({ operation: 'delete', patch: null }),
      captured({ operation: 'insert', inversePatch: null })
    ]);

    expect(entryCount).toBe(liveRows);
    expect(entryCount).toBe(1);
  });

  it('同一命名空间下不同实体名不互相折叠', () => {
    const { entryCount, liveRows } = replay([
      captured({ entity: 'Post', entityId: 'x' }),
      captured({ entity: 'Comment', entityId: 'x' })
    ]);

    expect(entryCount).toBe(liveRows);
    expect(entryCount).toBe(2);
  });

  it('不同命名空间下同名实体不互相折叠', () => {
    const { entryCount, liveRows } = replay([
      captured({ namespace: 'app', entityId: 'x' }),
      captured({ namespace: 'plugin', entityId: 'x' })
    ]);

    expect(entryCount).toBe(liveRows);
    expect(entryCount).toBe(2);
  });
});

describe('折叠是纯函数', () => {
  it('不改动传进来的已有行', () => {
    const first = rowAfter(undefined, captured({ patch: { title: 'T1' }, inversePatch: { title: HEAD_TITLE } }));
    const snapshot = structuredClone(first);

    foldWorkingTreeEntry(first, captured({ patch: { title: 'T2' }, inversePatch: { title: 'T1' } }));

    expect(first).toEqual(snapshot);
  });

  it('不改动传进来的捕获', () => {
    const write = captured({ patch: { title: 'T1' } });
    const snapshot = structuredClone(write);

    foldWorkingTreeEntry(undefined, write);

    expect(write).toEqual(snapshot);
  });

  it('同样输入折两次结果相同', () => {
    const existing = rowAfter(undefined, captured({ patch: { title: 'T1' } }));
    const write = captured({ patch: { body: 'B1' } });

    expect(foldWorkingTreeEntry(existing, write)).toEqual(foldWorkingTreeEntry(existing, write));
  });
});
