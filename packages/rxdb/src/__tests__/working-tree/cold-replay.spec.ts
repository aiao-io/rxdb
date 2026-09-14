/**
 * @fileoverview T047 红测试：冷重放不变量——「捕获是否完备」的**唯一**判据
 *   （conformance-suites.md §1.1、SC-009）。
 *
 * @remarks
 * 实现目标是 `src/working-tree/cold-replay.ts`。它不是一个业务能力，是一把**尺子**：
 * T067 的捕获套件在 4 个挂载点的每一组末尾都要拿它量一次，6 个 v1 后端共用同一把。
 *
 * 这里刻意不开数据库。冷重放在真实后端上的形态归 T067；本文件钉的是**尺子本身**。
 * 一把只在被测物身上验证过的尺子是循环论证：某个挂载点漏捕获了一列、而判据恰好也不看
 * 那一列，两边一起绿，而且是永远一起绿。
 *
 * 为什么这几组断言值得写：
 *
 * 1. **计数相等是最顺手、也最没用的判据**。「改了 3 行就该有 3 个单元」写起来一行，
 *    读起来像在验证捕获，实际两个方向都测不到：折叠规则（data-model.md §2.7）让
 *    「同一实体写 5 次 = 1 个单元」「insert 后 delete = 0 个单元」，计数天然对不上；
 *    而一个把 `body` 列漏掉的 patch，计数分毫不差。契约写死「**不靠计数相等**」就是
 *    冲着后者去的，所以这里用一对**互为反例**的用例钉死：计数相等但必须红、
 *    计数悬殊但必须绿。
 * 2. **「逐字段」的「逐」字是可操作性**。`JSON.stringify(a) === JSON.stringify(b)` 也能
 *    判等，代价是键序不同就假红、真红时又只会说「这一行不一样」。6 个后端 × 十几组
 *    跑出来的 CI 日志里，不点名到列的失败等于没有失败。
 * 3. **两个方向都是缺陷**。业务表变了而没有单元 = 挂载点漏了；有单元而业务表没那一行 =
 *    捕获写了不该写的。只查其中一个方向的判据，会把另一半故障判成通过。
 * 4. **「冷」是指只能读持久化的那几列**。`sourceChangeId` 在实体上写明「**仅诊断**，
 *    不得作为重放数据来源」——`rxdb_change` 会被删分支级联 / 压缩合并 / 清理，顺着它
 *    重放今天能跑通，某次清理之后静默少几行。同理 `origin` 不参与：远端同步产生的单元
 *    照常重放（硬裁决 6），按来源豁免等于把 `remote_sync` 的捕获缺陷永久藏起来。
 * 5. **折叠后的表不是一串日志**。唯一索引 `(branch, namespace, entity, entityId)` 保证
 *    每个身份至多一行，因此重放与数组顺序无关；「按 `find()` 返回顺序依次 apply」今天
 *    恰好正确，换个驱动、加个 `ORDER BY`，或者某天真的出现两行同身份，就静默出错。
 * 6. **折叠不变量被破坏的输入不能兜底**。HEAD 里已存在却标 `insert`、HEAD 里没有却标
 *    `delete`、同一身份两行——这三种输入在折叠规则下不可能产生，出现即表示工作树已经坏了。
 *    「就当 update 处理」会让一个坏掉的工作树重放成功，于是唯一判据判出绿灯。
 */

import { describe, expect, it } from 'vitest';
import {
  assertColdReplayInvariant,
  ColdReplayMismatchError,
  diffColdReplay,
  replayWorkingTree,
  WorkingTreeReplayCorruptionError,
  type ColdReplayRow,
  type ColdReplaySnapshot
} from '../../working-tree/cold-replay.js';
import { WorkingTreeEntry } from '../../working-tree/working-tree-entry.entity.js';

const identityKey = (row: { readonly namespace: string; readonly entity: string; readonly entityId: string }): string =>
  `${row.namespace}.${row.entity}#${row.entityId}`;

/**
 * 重放结果的数组顺序**不是**契约的一部分（见 5.），所以比对前统一按身份排序。
 */
const sortRows = (rows: ColdReplaySnapshot): readonly ColdReplayRow[] =>
  [...rows].sort((a, b) => identityKey(a).localeCompare(identityKey(b)));

const noteRow = (entityId: string, fields: Record<string, unknown>): ColdReplayRow => ({
  namespace: 'app',
  entity: 'Note',
  entityId,
  fields
});

const tagRow = (entityId: string, fields: Record<string, unknown>): ColdReplayRow => ({
  namespace: 'app',
  entity: 'Tag',
  entityId,
  fields
});

let entrySeq = 0;

/**
 * 造一行**持久化形态**的工作树条目。
 *
 * @remarks
 * 返回 {@link WorkingTreeEntry} 而不是随手拼一个窄对象：重放吃的必须就是落库那一行。
 * 若实现把入参类型定成别的形状（列名漂移、`operation` 放宽成 `string`），这里编译期就红。
 */
function persistedEntry(
  init: Pick<WorkingTreeEntry, 'namespace' | 'entity' | 'entityId' | 'operation' | 'patch'> & Partial<WorkingTreeEntry>
): WorkingTreeEntry {
  entrySeq += 1;
  return {
    id: `wte-${entrySeq}`,
    branchId: 'branch-main',
    unitId: `unit-${entrySeq}`,
    transactionId: null,
    inversePatch: null,
    fingerprint: `fp-${entrySeq}`,
    origin: 'local',
    sourceChangeId: null,
    createdAt: new Date('2026-09-13T00:00:00.000Z'),
    updatedAt: new Date('2026-09-13T00:00:00.000Z'),
    ...init
  };
}

const updateNote1 = (patch: Record<string, unknown>): WorkingTreeEntry =>
  persistedEntry({ namespace: 'app', entity: 'Note', entityId: 'note-1', operation: 'update', patch });

const HEAD: ColdReplaySnapshot = [
  noteRow('note-1', { id: 'note-1', title: 'old title', body: 'old body', pinned: false }),
  noteRow('note-2', { id: 'note-2', title: 'kept', body: 'kept', pinned: true })
];

describe('replayWorkingTree — 三种操作各自的净状态', () => {
  it('update 把 patch 逐字段盖在 HEAD 行上，未提及的字段原样保留', () => {
    const replayed = replayWorkingTree(HEAD, [updateNote1({ title: 'new title' })]);

    expect(sortRows(replayed)).toEqual([
      noteRow('note-1', { id: 'note-1', title: 'new title', body: 'old body', pinned: false }),
      noteRow('note-2', { id: 'note-2', title: 'kept', body: 'kept', pinned: true })
    ]);
  });

  it('insert 的净状态**只**来自 patch，不掺 HEAD 的任何字段', () => {
    const replayed = replayWorkingTree(HEAD, [
      persistedEntry({
        namespace: 'app',
        entity: 'Note',
        entityId: 'note-3',
        operation: 'insert',
        patch: { id: 'note-3', title: 'fresh', body: 'fresh', pinned: false }
      })
    ]);

    expect(sortRows(replayed).at(-1)).toEqual(
      noteRow('note-3', { id: 'note-3', title: 'fresh', body: 'fresh', pinned: false })
    );
  });

  it('delete 让这一行从净状态里消失，不是留一行空值', () => {
    const replayed = replayWorkingTree(HEAD, [
      persistedEntry({
        namespace: 'app',
        entity: 'Note',
        entityId: 'note-2',
        operation: 'delete',
        patch: null
      })
    ]);

    expect(sortRows(replayed).map(identityKey)).toEqual(['app.Note#note-1']);
  });

  it('身份是 namespace + entity + entityId 三列，同 id 不同实体互不相干', () => {
    const head: ColdReplaySnapshot = [noteRow('x-1', { id: 'x-1', v: 'note' }), tagRow('x-1', { id: 'x-1', v: 'tag' })];
    const replayed = replayWorkingTree(head, [
      persistedEntry({ namespace: 'app', entity: 'Tag', entityId: 'x-1', operation: 'update', patch: { v: 'tag*' } })
    ]);

    expect(sortRows(replayed)).toEqual([
      noteRow('x-1', { id: 'x-1', v: 'note' }),
      tagRow('x-1', { id: 'x-1', v: 'tag*' })
    ]);
  });

  it('不改入参：HEAD 快照与其中的字段对象都不被就地修改', () => {
    const head: ColdReplaySnapshot = [noteRow('note-1', { id: 'note-1', title: 'old title' })];
    replayWorkingTree(head, [updateNote1({ title: 'new title' })]);

    expect(head).toEqual([noteRow('note-1', { id: 'note-1', title: 'old title' })]);
  });
});

describe('replayWorkingTree — 折叠后的表不是一串日志', () => {
  const entries = [
    updateNote1({ title: 'new title' }),
    persistedEntry({
      namespace: 'app',
      entity: 'Note',
      entityId: 'note-3',
      operation: 'insert',
      patch: { id: 'note-3', title: 'fresh' }
    }),
    persistedEntry({ namespace: 'app', entity: 'Note', entityId: 'note-2', operation: 'delete', patch: null })
  ];

  it('条目顺序不影响结果——每个身份至多一行，重放不是顺序 apply', () => {
    const forward = sortRows(replayWorkingTree(HEAD, entries));
    const reversed = sortRows(replayWorkingTree(HEAD, [...entries].reverse()));

    expect(reversed).toEqual(forward);
  });

  it('HEAD 行顺序同样不影响结果', () => {
    const forward = sortRows(replayWorkingTree(HEAD, entries));
    const reversed = sortRows(replayWorkingTree([...HEAD].reverse(), entries));

    expect(reversed).toEqual(forward);
  });
});

describe('replayWorkingTree — 「冷」= 只读身份三列与 operation / patch', () => {
  it('诊断列（unitId / transactionId / fingerprint / sourceChangeId / 时间戳）不参与重放', () => {
    const lean = [updateNote1({ title: 'new title' })];
    const noisy = [
      persistedEntry({
        namespace: 'app',
        entity: 'Note',
        entityId: 'note-1',
        operation: 'update',
        patch: { title: 'new title' },
        unitId: 'unit-zzz',
        transactionId: '0f7f9d9e-0000-4000-8000-000000000000',
        fingerprint: 'fp-zzz',
        sourceChangeId: 999_999,
        createdAt: new Date('2030-01-01T00:00:00.000Z'),
        updatedAt: new Date('2030-01-01T00:00:00.000Z')
      })
    ];

    expect(sortRows(replayWorkingTree(HEAD, noisy))).toEqual(sortRows(replayWorkingTree(HEAD, lean)));
  });

  it("origin='remote_sync' 与 'local' 重放结果完全一致——工作树不按来源豁免", () => {
    const local = [updateNote1({ title: 'synced' })];
    const remote = [
      persistedEntry({
        namespace: 'app',
        entity: 'Note',
        entityId: 'note-1',
        operation: 'update',
        patch: { title: 'synced' },
        origin: 'remote_sync'
      })
    ];

    expect(sortRows(replayWorkingTree(HEAD, remote))).toEqual(sortRows(replayWorkingTree(HEAD, local)));
  });
});

describe('冷重放是唯一判据——计数相等救不了，计数悬殊也冤不了', () => {
  it('计数分毫不差但漏了一列 → 必须红，且点名到列', () => {
    // 1 个单元、1 行与 HEAD 不同：任何按计数判等的实现在这里都报绿。
    const actual: ColdReplaySnapshot = [
      noteRow('note-1', { id: 'note-1', title: 'new title', body: 'new body', pinned: false }),
      noteRow('note-2', { id: 'note-2', title: 'kept', body: 'kept', pinned: true })
    ];
    const entries = [updateNote1({ title: 'new title' })];

    expect(() => assertColdReplayInvariant({ head: HEAD, entries, actual })).toThrow(ColdReplayMismatchError);
    expect(diffColdReplay(replayWorkingTree(HEAD, entries), actual)).toEqual([
      {
        kind: 'field_mismatch',
        namespace: 'app',
        entity: 'Note',
        entityId: 'note-1',
        field: 'body',
        replayed: 'old body',
        actual: 'new body'
      }
    ]);
  });

  it('6 次写入折叠成 1 个单元、另有一对 insert+delete 折叠成 0 个 → 必须绿', () => {
    // 写入次数 6、单元数 1、与 HEAD 不同的行数 1：三个数字互不相等，重放照样成立。
    const entries = [updateNote1({ title: 'v6', body: 'v6' })];
    const actual: ColdReplaySnapshot = [
      noteRow('note-1', { id: 'note-1', title: 'v6', body: 'v6', pinned: false }),
      noteRow('note-2', { id: 'note-2', title: 'kept', body: 'kept', pinned: true })
    ];

    expect(diffColdReplay(replayWorkingTree(HEAD, entries), actual)).toEqual([]);
    expect(() => assertColdReplayInvariant({ head: HEAD, entries, actual })).not.toThrow();
  });
});

describe('diffColdReplay — 两个方向都是缺陷', () => {
  it('业务表变了却没有单元（挂载点漏捕获）→ 报字段差异', () => {
    const actual: ColdReplaySnapshot = [
      noteRow('note-1', { id: 'note-1', title: 'changed behind our back', body: 'old body', pinned: false }),
      noteRow('note-2', { id: 'note-2', title: 'kept', body: 'kept', pinned: true })
    ];

    expect(diffColdReplay(replayWorkingTree(HEAD, []), actual)).toEqual([
      {
        kind: 'field_mismatch',
        namespace: 'app',
        entity: 'Note',
        entityId: 'note-1',
        field: 'title',
        replayed: 'old title',
        actual: 'changed behind our back'
      }
    ]);
  });

  it('单元重放出业务表没有的行（幻影捕获）→ 报 replay_only_row', () => {
    const entries = [
      persistedEntry({
        namespace: 'app',
        entity: 'Note',
        entityId: 'note-9',
        operation: 'insert',
        patch: { id: 'note-9', title: 'never written' }
      })
    ];

    expect(diffColdReplay(replayWorkingTree(HEAD, entries), HEAD)).toEqual([
      { kind: 'replay_only_row', namespace: 'app', entity: 'Note', entityId: 'note-9' }
    ]);
  });

  it('业务表多出一行而重放里没有 → 报 business_only_row', () => {
    const actual: ColdReplaySnapshot = [...HEAD, noteRow('note-7', { id: 'note-7', title: 'ghost' })];

    expect(diffColdReplay(replayWorkingTree(HEAD, []), actual)).toEqual([
      { kind: 'business_only_row', namespace: 'app', entity: 'Note', entityId: 'note-7' }
    ]);
  });

  it('两侧的行顺序不同不算差异', () => {
    expect(diffColdReplay(replayWorkingTree(HEAD, []), [...HEAD].reverse())).toEqual([]);
  });
});

describe('diffColdReplay — 「逐字段」的「逐」字', () => {
  const head: ColdReplaySnapshot = [
    noteRow('note-1', {
      id: 'note-1',
      title: 'a',
      body: 'b',
      updatedAt: new Date('2026-09-13T00:00:00.000Z'),
      meta: { tags: ['x', 'y'], nested: { n: 1 } }
    })
  ];

  it('键序不同不算差异', () => {
    const actual: ColdReplaySnapshot = [
      noteRow('note-1', {
        meta: { nested: { n: 1 }, tags: ['x', 'y'] },
        updatedAt: new Date('2026-09-13T00:00:00.000Z'),
        body: 'b',
        title: 'a',
        id: 'note-1'
      })
    ];

    expect(diffColdReplay(replayWorkingTree(head, []), actual)).toEqual([]);
  });

  it('Date 按时间值比，不按对象同一性比', () => {
    const actual: ColdReplaySnapshot = [
      noteRow('note-1', {
        id: 'note-1',
        title: 'a',
        body: 'b',
        // 每次从库里读回来都是**新的** Date 实例；按同一性比会让不变量永远红。
        updatedAt: new Date('2026-09-13T00:00:00.000Z'),
        meta: { tags: ['x', 'y'], nested: { n: 1 } }
      })
    ];

    expect(diffColdReplay(replayWorkingTree(head, []), actual)).toEqual([]);
  });

  it('json 列按结构比到底，嵌套里差一个元素就点名到该列', () => {
    const actual: ColdReplaySnapshot = [
      noteRow('note-1', {
        id: 'note-1',
        title: 'a',
        body: 'b',
        updatedAt: new Date('2026-09-13T00:00:00.000Z'),
        meta: { tags: ['x'], nested: { n: 1 } }
      })
    ];

    expect(diffColdReplay(replayWorkingTree(head, []), actual)).toEqual([
      {
        kind: 'field_mismatch',
        namespace: 'app',
        entity: 'Note',
        entityId: 'note-1',
        field: 'meta',
        replayed: { tags: ['x', 'y'], nested: { n: 1 } },
        actual: { tags: ['x'], nested: { n: 1 } }
      }
    ]);
  });

  it('「这一列压根不在」与「这一列是 null」是两件事', () => {
    // 少一个键 = HEAD 投影或 patch 漏了这一列，正是要抓的故障；
    // 把它当成 null 相等，就把漏列藏进了「反正业务值也是 null」。
    const replayed: ColdReplaySnapshot = [noteRow('note-1', { id: 'note-1', title: 'a' })];
    const actual: ColdReplaySnapshot = [noteRow('note-1', { id: 'note-1', title: 'a', body: null })];

    expect(diffColdReplay(replayed, actual)).toEqual([
      {
        kind: 'field_mismatch',
        namespace: 'app',
        entity: 'Note',
        entityId: 'note-1',
        field: 'body',
        replayed: undefined,
        actual: null
      }
    ]);
  });

  it('多列不同就报多条，不是笼统一条「这行不一样」', () => {
    // 报告顺序按列名排序：跟着键序走的话，同一处缺陷在两个后端上会印出两种顺序，
    // 「CI 日志一比就知道是不是同一个问题」这件事立刻失效。
    const replayed: ColdReplaySnapshot = [noteRow('note-1', { id: 'note-1', title: 'a', body: 'b', pinned: false })];
    const actual: ColdReplaySnapshot = [noteRow('note-1', { id: 'note-1', title: 'A', body: 'B', pinned: false })];

    // `field` 只长在 `field_mismatch` 这一支上，所以按 kind 取：混进别的支时印出来的是那个 kind，
    // 而不是一串 `undefined`——差异报告本身读不懂的话，这条用例就白写了。
    const fields = diffColdReplay(replayed, actual).map(mismatch =>
      mismatch.kind === 'field_mismatch' ? mismatch.field : mismatch.kind
    );

    expect(fields).toEqual(['body', 'title']);
  });
});

describe('assertColdReplayInvariant — 失败报告要能直接动手', () => {
  it('相等时静默返回', () => {
    expect(assertColdReplayInvariant({ head: HEAD, entries: [], actual: HEAD })).toBeUndefined();
  });

  it('抛出的错误带上全部差异，且消息点名到实体与列', () => {
    const actual: ColdReplaySnapshot = [
      noteRow('note-1', { id: 'note-1', title: 'new title', body: 'new body', pinned: false }),
      noteRow('note-2', { id: 'note-2', title: 'kept', body: 'kept', pinned: true })
    ];
    const entries = [updateNote1({ title: 'new title' })];

    try {
      assertColdReplayInvariant({ head: HEAD, entries, actual });
      expect.unreachable('冷重放不变量被破坏时必须抛错');
    } catch (error) {
      expect(error).toBeInstanceOf(ColdReplayMismatchError);
      const mismatchError = error as ColdReplayMismatchError;
      expect(mismatchError.name).toBe('ColdReplayMismatchError');
      expect(mismatchError.mismatches).toHaveLength(1);
      expect(mismatchError.message).toContain('app.Note#note-1');
      expect(mismatchError.message).toContain('body');
    }
  });
});

describe('replayWorkingTree — 折叠不变量被破坏时不兜底', () => {
  it('HEAD 里已存在却标 insert → 抛错，不降级成 update', () => {
    const entries = [
      persistedEntry({
        namespace: 'app',
        entity: 'Note',
        entityId: 'note-1',
        operation: 'insert',
        patch: { id: 'note-1', title: 'dup' }
      })
    ];

    expect(() => replayWorkingTree(HEAD, entries)).toThrow(WorkingTreeReplayCorruptionError);
  });

  it('HEAD 里没有却标 delete → 抛错（折叠规则 2 要求这种单元根本不存在）', () => {
    const entries = [
      persistedEntry({ namespace: 'app', entity: 'Note', entityId: 'note-404', operation: 'delete', patch: null })
    ];

    expect(() => replayWorkingTree(HEAD, entries)).toThrow(WorkingTreeReplayCorruptionError);
  });

  it('同一身份出现两行 → 抛错（唯一索引本不允许）', () => {
    const entries = [updateNote1({ title: 'first' }), updateNote1({ title: 'second' })];

    expect(() => replayWorkingTree(HEAD, entries)).toThrow(WorkingTreeReplayCorruptionError);
  });

  it('HEAD 里没有却标 update → 抛错（insert 后再改会折叠成 insert，不会留 update）', () => {
    const entries = [
      persistedEntry({
        namespace: 'app',
        entity: 'Note',
        entityId: 'note-404',
        operation: 'update',
        patch: { title: 'x' }
      })
    ];

    expect(() => replayWorkingTree(HEAD, entries)).toThrow(WorkingTreeReplayCorruptionError);
  });

  it('insert / update 的 patch 为 null → 抛错（记了「变过」却没记变成什么）', () => {
    const entries = [
      persistedEntry({ namespace: 'app', entity: 'Note', entityId: 'note-1', operation: 'update', patch: null })
    ];

    expect(() => replayWorkingTree(HEAD, entries)).toThrow(WorkingTreeReplayCorruptionError);
  });

  it('delete 的 patch 不为 null → 抛错（恢复数据只该在 inversePatch 里）', () => {
    const entries = [
      persistedEntry({
        namespace: 'app',
        entity: 'Note',
        entityId: 'note-2',
        operation: 'delete',
        patch: { title: 'kept' }
      })
    ];

    expect(() => replayWorkingTree(HEAD, entries)).toThrow(WorkingTreeReplayCorruptionError);
  });
});
