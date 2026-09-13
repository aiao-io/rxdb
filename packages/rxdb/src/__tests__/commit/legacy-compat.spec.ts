/**
 * @fileoverview T030 红测试：启用 commit 能力后既有机制一条不改，且 durable commit
 * 历史与会话级 redo 栈彼此正交（FR-018/019）。
 *
 * @remarks
 * 契约见 `specs/001-working-tree-commits/spec.md` FR-018「已有 API 的行为不能因为 commit
 * 功能而改变」与 FR-019「刷新后 redo 可清空，但 commit 与 HEAD 不得清空」。实现目标是
 * `src/commit/commit-capability.ts`（T031）与 `src/commit/write-commit.ts`（T035）。
 *
 * **本文件钉的是契约与机制，不是行为回归**，这一点必须说在前面。
 * FR-018 字面上要求「既有行为逐条不变」，逐条复跑它的最诚实做法是真的 `save()` 一遍、
 * 让 `RxDBChange` 落库、再 undo / redo / `restoreEntity` 走一圈。但这一层做不到：
 * `fixtures/test-db-setup.ts` 的 `MockLocalAdapter`「只保留形状，不保留存储」，
 * 该文件的 TSDoc 还明写了「不要把 unit 层的 mock 测试改为真集成测试」。
 * 真实读写语义归各适配器包的集成用例与 `workingTreeCommitConformanceSuite`（T042/T043），
 * 既有 undo/redo/restore 行为归 `__tests__/version/VersionManager.spec.ts` 与
 * `HistoryManager.spec.ts`。所以这里只回答一个它们都回答不了的问题：
 * **commit 这条新链路有没有动到那些机制赖以成立的形状。**
 *
 * 为什么这五组断言值得写：
 *
 * 1. **「给 change 打个标记」是最省事也最贵的做法**。要把 commit 和既有变更关联起来，
 *    给 `rxdb_change` 加一列 `commitId` 是一行的事，commit 侧全部用例照绿。
 *    但 `RxDBChange` 是**同步表**：push/pull 的列投影、远端 schema、既有迁移阶梯
 *    全都跟着动，而这些地方一个 commit 用例也覆盖不到。所以这张表的列集按绝对值钉死，
 *    不用 `arrayContaining`——对它而言「只是加一列」本身就是破坏性变更。
 * 2. **`RxDBBranch` 的方向相反：只准加，不准改**。T027 要给它追加 `activeKey`，
 *    所以这里只能钉「既有 7 列一列不少、类型不变」。尤其是 `activated`——
 *    `switchBranch` 与分支解析读的就是它，语义一改，两处会在零编译错误的情况下改行为。
 * 3. **复用 `rxdb_change` 存 commit 会被既有清理逻辑悄悄删掉历史**。
 *    `compactChanges` / `cleanupExpired` 是按「change 是可回收的」写的，而 commit 是
 *    only-append 永不回收。真复用了，删的那天没有任何报错，只是历史短了一截；
 *    而 FR-018 又禁止为了 commit 去改这些既有清理路径。于是「commit 不碰 change 表」
 *    必须是硬约束，从三个角度同时钉：表里没行、`saveMany` 没收到、语句里没提过表名。
 * 4. **给 redo 栈加持久化看起来像是在补功能，实际是在造第二份历史**。
 *    FR-019 要的是「刷新后 redo 可清空」——RedoStack 里那个 `BehaviorSubject` 每次
 *    `init()` 重建就是这条语义的全部实现机制，一旦有人给它加上 `load()` / `hydrate()`，
 *    这条语义当场消失，且与 commit 历史形成两份会互相矛盾的 durable 记录。
 *    反过来，commit 侧的表也不得沾染 redo 失效语义。两个方向写在同一个用例里，
 *    因为它们其实是同一条边界的两侧。
 * 5. **入口被「顺手整理」挪走**，是重构里最常见的兼容性破坏：方法还在、名字还在、
 *    只是换了个类或换了签名。这里只钉「还在原位、参数个数没变」，钉不了行为——
 *    见本段开头对分层的说明。
 */

import { describe, expect, it } from 'vitest';
import type { CommitChangeUnit } from '../../commit/change-unit.js';
import { computeChangeUnitFingerprint } from '../../commit/change-unit.js';
import { CommitBranchRef } from '../../commit/commit-branch-ref.entity.js';
import {
  COMMIT_CAPABILITY_STATE_ID,
  COMMIT_GRAPH_SCHEMA_VERSION,
  COMMIT_PROTOCOL_VERSION,
  CommitCapabilityState
} from '../../commit/commit-capability-state.entity.js';
import { enableCommitCapability } from '../../commit/commit-capability.js';
import { CommitChangeSet } from '../../commit/commit-change-set.entity.js';
import { Commit } from '../../commit/commit.entity.js';
import type { WriteCommitInput } from '../../commit/write-commit.js';
import { writeCommit } from '../../commit/write-commit.js';
import type { EntityManager } from '../../entity/entity-manager.js';
import type { EntityType } from '../../entity/entity.interface.js';
import { PropertyType, SyncType } from '../../entity/metadata-options.interface.js';
import type { EntityPropertyMetadata } from '../../entity/property-types.interface.js';
import { getEntityMetadata } from '../../rxdb-utils.js';
import { RxDB } from '../../RxDB.js';
import { RxDBBranch } from '../../system/branch.js';
import { RXDB_CHANGE_CODEC_VERSION } from '../../system/change-codec.js';
import { RxDBChange } from '../../system/change.js';
import { HistoryManager } from '../../version/HistoryManager.js';
import { RedoStack } from '../../version/redo-stack.js';
import { VersionManager } from '../../version/VersionManager.js';
import { createMockAdapter } from '../fixtures/test-db-setup.js';
import { createCommitGraphProbe, normalizeSql } from './fixtures/commit-graph-probe.js';

const CALLER_OPERATION_ID = '00000000-0000-4000-8000-0000000000d0';

/** 取一张表在 DDL 口径下的完整列集（`propertyMap` 含基类注入，`properties` 不含）。 */
type ColumnType = EntityPropertyMetadata['type'];

const columnsOf = (EntityClass: EntityType): [string, ColumnType][] =>
  [...getEntityMetadata(EntityClass).propertyMap.values()].map(property => [property.name, property.type]);

const columnNamesOf = (EntityClass: EntityType): string[] => columnsOf(EntityClass).map(([name]) => name);

/** `RxDBChange` 在 commit 能力落地前的列集，按声明顺序。 */
const LEGACY_CHANGE_COLUMNS: [string, ColumnType][] = [
  ['id', PropertyType.integer],
  ['remoteId', PropertyType.integer],
  ['type', PropertyType.string],
  ['transactionId', PropertyType.uuid],
  ['namespace', PropertyType.string],
  ['entity', PropertyType.string],
  ['entityId', PropertyType.string],
  ['inversePatch', PropertyType.json],
  ['patch', PropertyType.json],
  ['createdAt', PropertyType.date],
  ['updatedAt', PropertyType.date],
  ['localId', PropertyType.integer],
  ['revertChangedAt', PropertyType.date],
  ['revertChangeId', PropertyType.integer],
  ['redoInvalidatedAt', PropertyType.date]
];

/** `RxDBBranch` 在 commit 能力落地前的列集；T027 允许在其后**追加**。 */
const LEGACY_BRANCH_COLUMNS: [string, ColumnType][] = [
  ['id', PropertyType.string],
  ['activated', PropertyType.boolean],
  ['fromChangeId', PropertyType.number],
  ['local', PropertyType.boolean],
  ['remote', PropertyType.boolean],
  ['createdAt', PropertyType.date],
  ['updatedAt', PropertyType.date]
];

function createEntityManager(): EntityManager {
  const database = new RxDB({
    dbName: `rxdb-legacy-compat-${Math.random().toString(36).slice(2)}`,
    entities: [],
    sync: { local: { adapter: 'local' }, type: SyncType.None }
  });
  database.adapter('local', db => createMockAdapter(db));
  database.init();
  return database.entityManager;
}

function createUnit(overrides: Partial<CommitChangeUnit> = {}): CommitChangeUnit {
  const { fingerprint, ...rest } = overrides;
  const base: Omit<CommitChangeUnit, 'fingerprint'> = {
    unitId: 'unit-1',
    transactionId: null,
    namespace: 'app',
    entity: 'Recipe',
    entityId: 'recipe-1',
    operation: 'update',
    patch: { title: 'after' },
    inversePatch: { title: 'before' },
    baseFingerprint: 'fp-base',
    origin: 'local',
    ...rest
  };
  return { ...base, fingerprint: fingerprint ?? computeChangeUnitFingerprint(base) };
}

function createWriteInput(overrides: Partial<WriteCommitInput> = {}): WriteCommitInput {
  return {
    branchId: 'main',
    branchGeneration: 1,
    expectedHeadRevision: 0,
    kind: 'normal',
    message: '改了标题',
    author: 'jimmy',
    operationId: CALLER_OPERATION_ID,
    units: [createUnit()],
    ...overrides
  };
}

interface Scene {
  readonly probe: ReturnType<typeof createCommitGraphProbe>;
  readonly entityManager: EntityManager;
}

/** 造一个「CAS 必然命中」的场景——这样写入必然发生，才谈得上「写入没碰到 change 表」。 */
function createScene(): Scene {
  const entityManager = createEntityManager();
  const probe = createCommitGraphProbe({ rowsAffected: 1 });
  const ref = entityManager.instantiate(CommitBranchRef);
  ref.id = 'main';
  ref.branchId = 'main';
  ref.generation = 1;
  ref.headCommitId = null;
  ref.headRevision = 0;
  ref.status = 'ok';
  ref.corruptedAt = null;
  probe.seed(CommitBranchRef, [ref]);

  // 能力行也得在：`enableCommitCapability()` 读不到它就 fail-closed 抛错，
  // 这一行是 `0004` 迁移建表时一并写下的（表已建、版本已填、尚未启用），
  // 不是「启用」本身的产物。少了它，本文件关于「启用没动到既有形状」的用例
  // 会在还没启用之前就炸，看起来像实现有问题，实际是场景没搭全。
  const capability = entityManager.instantiate(CommitCapabilityState);
  capability.id = COMMIT_CAPABILITY_STATE_ID;
  capability.enabled = false;
  capability.protocolVersion = COMMIT_PROTOCOL_VERSION;
  capability.schemaVersion = COMMIT_GRAPH_SCHEMA_VERSION;
  capability.codecVersion = RXDB_CHANGE_CODEC_VERSION;
  capability.enabledAt = null;
  probe.seed(CommitCapabilityState, [capability]);

  return { probe, entityManager };
}

describe('RxDBChange 的形状不因 commit 能力而改（FR-018）', () => {
  it('列集与类型逐列对齐启用前的样子——这张表只准原样不动', () => {
    // 绝对值而非 arrayContaining：`rxdb_change` 走同步，加一列就动到远端 schema、
    // push/pull 列投影与既有迁移阶梯，而那些地方 commit 侧一个用例也覆盖不到。
    expect(columnsOf(RxDBChange)).toEqual(LEGACY_CHANGE_COLUMNS);
  });

  it('表名与 log 开关不变', () => {
    const metadata = getEntityMetadata(RxDBChange);
    expect({ tableName: metadata.tableName, log: metadata.log, namespace: metadata.namespace }).toEqual({
      tableName: 'rxdb_change',
      log: false,
      namespace: 'rxdb'
    });
  });

  it('真跑一次启用之后，列集仍是同一份', async () => {
    const before = columnsOf(RxDBChange);
    const scene = createScene();

    await enableCommitCapability(scene.probe.executor);

    // 启用若在运行时往既有元数据上补列（「顺便把 commitId 挂上去」），
    // 只有在启用之后再看一眼才发现得了。
    expect(columnsOf(RxDBChange)).toEqual(before);
    expect(columnsOf(RxDBChange)).toEqual(LEGACY_CHANGE_COLUMNS);
  });
});

describe('RxDBBranch 既有列一列不少（FR-018）', () => {
  it('7 个既有列与类型全在——允许追加，不允许改写', () => {
    // T027 要给这张表追加 `activeKey`，所以这里不能钉绝对集；
    // 但既有列少一个、或类型变一个，分支解析与 switchBranch 会当场改行为。
    expect(columnsOf(RxDBBranch)).toEqual(expect.arrayContaining(LEGACY_BRANCH_COLUMNS));
  });

  it('activated 仍是布尔标记，不是「当前分支 id」之类的新语义', () => {
    // 把它改成字符串或时间戳同样能表达「哪个是当前分支」，编译也过，
    // 但 switchBranch / resolve_current_branch 读到的含义就变了。
    const activated = getEntityMetadata(RxDBBranch).propertyMap.get('activated');
    expect(activated?.type).toBe(PropertyType.boolean);
  });

  it('表名与 log 开关不变', () => {
    const metadata = getEntityMetadata(RxDBBranch);
    expect({ tableName: metadata.tableName, log: metadata.log }).toEqual({ tableName: 'rxdb_branch', log: false });
  });
});

describe('commit 不写 RxDBChange（FR-018）', () => {
  it('一次成功的 commit 之后，change 表一行没多', async () => {
    const scene = createScene();

    const outcome = await writeCommit(scene.probe.executor, scene.entityManager, createWriteInput());

    expect(outcome.status).toBe('committed');
    // 复用 change 表存 commit 的那天，`compactChanges` / `cleanupExpired`
    // 会按「change 可回收」把历史删掉，而且不报任何错。
    expect(scene.probe.rowsOf(RxDBChange)).toEqual([]);
    expect(scene.probe.saved.some(entity => entity instanceof RxDBChange)).toBe(false);
  });

  it('commit 落的是自己的表——反向对照，证明上一条不是空跑', async () => {
    const scene = createScene();

    await writeCommit(scene.probe.executor, scene.entityManager, createWriteInput());

    expect(scene.probe.rowsOf(Commit)).toHaveLength(1);
    expect(scene.probe.rowsOf(CommitChangeSet)).toHaveLength(1);
  });

  it('发出的原始语句里没有 rxdb_change', async () => {
    const scene = createScene();

    await writeCommit(scene.probe.executor, scene.entityManager, createWriteInput());

    // ORM 之外还有一条路：直接发 SQL 去 change 表上打标记。
    for (const sql of scene.probe.statements) {
      expect(normalizeSql(sql)).not.toContain('rxdb_change');
    }
  });
});

describe('durable commit 历史与会话级 redo 栈正交（FR-019）', () => {
  it('新建的 redo 栈是空的——这就是「刷新后 redo 可清空」的全部机制', () => {
    // 每次 init() 重建 HistoryManager 即重建这个 BehaviorSubject；
    // 它天生为空，所以刷新后 redo 自然清空，不需要额外的清理步骤。
    expect(new RedoStack().value).toEqual([]);
  });

  it('RedoStack 没有任何持久化入口', () => {
    // 加一个 load()/hydrate() 看起来像补功能，实际是在 commit 之外再造一份 durable
    // 历史：两份记录会对同一段过去给出不同答案，而 FR-019 要的恰恰是它们分家。
    expect(Object.getOwnPropertyNames(RedoStack.prototype).sort()).toEqual([
      'clear',
      'constructor',
      'items$',
      'push',
      'remove',
      'value'
    ]);
  });

  it('commit 侧的表不带 redo 失效语义，而 RxDBChange 仍然带着', () => {
    const redoInvalidationColumns = ['redoInvalidatedAt', 'revertChangedAt', 'revertChangeId'];

    for (const EntityClass of [Commit, CommitChangeSet, CommitBranchRef]) {
      // `CommitBranchRef.corruptedAt` 是 FR-022 的损坏隔离，不在此列——
      // 这条钉的是「redo 失效」这套语义，不是「不许有时间戳列」。
      expect(columnNamesOf(EntityClass)).toEqual(expect.not.arrayContaining(redoInvalidationColumns));
    }
    // 反向对照：这三列必须仍在 change 表上，否则上一段是在空集合上空跑。
    expect(columnNamesOf(RxDBChange)).toEqual(expect.arrayContaining(redoInvalidationColumns));
  });
});

describe('undo/redo/restoreEntity 的既有入口没有被挪走（FR-018）', () => {
  it('HistoryManager 仍持有 undo/redo 的既有公共方法', () => {
    // 只钉「还在原位」，钉不了行为：unit 层的 fake adapter 没有存储
    // （见 fixtures/test-db-setup.ts），真实行为归 __tests__/version/*.spec.ts。
    expect(Object.getOwnPropertyNames(HistoryManager.prototype)).toEqual(
      expect.arrayContaining([
        'history',
        'pushToRedoStack',
        'removeFromRedoStack',
        'clearRedoStack',
        'invalidateRedoStack',
        'clearUndoHistory',
        'clearAllUndoHistory',
        'setUndoBranch',
        'isExecutingUndoRedo'
      ])
    );
  });

  it('VersionManager.restoreEntity 仍在，且仍收 (entity, options) 两个参数', () => {
    // 「顺手」给它加一个 commit 相关的第三参数并给默认值，签名看着兼容，
    // 但调用方的 arity 假设与 spec 里的 mock 会同时错位。
    const restoreEntity: unknown = VersionManager.prototype.restoreEntity;
    expect(typeof restoreEntity).toBe('function');
    expect((restoreEntity as (...args: unknown[]) => unknown).length).toBe(2);
  });

  it('VersionManager 仍从自己身上提供 history 与分支查询入口', () => {
    expect(Object.getOwnPropertyNames(VersionManager.prototype)).toEqual(
      expect.arrayContaining(['history', 'restoreEntity', 'getCurrentBranch'])
    );
  });
});
