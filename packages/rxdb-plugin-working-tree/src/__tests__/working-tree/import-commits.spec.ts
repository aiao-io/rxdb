/**
 * @fileoverview US-319：`importCommits()` 的命令体——把服务端下发的一段提交原样写进当前分支，分支头快进到最后一个。
 *
 * @remarks
 * 实现目标是 `src/working-tree/import-command.ts`（批次形状在 `import-batch.ts`）。底层是 `createCommitGraphProbe()` 那个替身：
 * 它不执行 SQL，只记下发出的语句、落库的行与交给 `mergeChanges` 的增删改。业务表真的等于链末提交的数据、六个后端结果一致，
 * 由一致性套件（`worktree.suite.ts`「导入远端提交」）在真实后端上证。
 *
 * 这一组钉的是六件事：
 *
 * 1. **被拒是返回值、零写入**：工作树脏、链首的父不是当前头、指纹不符、同 id 不同内容、缺父、批次形状不对、实体不能写，
 *    每一种都在第一条写语句之前返回，一条 `saveMany` / `query` / `mergeChanges` 都没发（AC#3 / AC#4 / AC#5）。
 * 2. **提交身份原样**：id、父链、种类、消息、作者、时间、内容指纹逐字落库（AC#1）。
 * 3. **只叠第一父链**：合并提交以 `merge` 入库、可以有多个父；侧枝提交只作为节点入库，它的 ChangeSet 不落业务表（AC#6）。
 * 4. **登记表 #17**：每个新到的第一父链提交一次 `mergeChanges`，触发器开着，入口是投影重写。
 * 5. **幂等**：同一批再导入一次、新头已在历史里，都是一个字节都不写的成功（AC#5）。
 * 6. **空分支起步**：HEAD 为空或是系统根节点、且受版本控制的业务表一行都没有时，链可以从另一个根开始（AC#1）。
 * 7. **前像核对**：叠业务表之前，第一父链上每个单元写之前的那一行都要与叠到它时的业务行对得上（插入时不存在、
 *    修改与删除时存在且 `inversePatch` 覆盖的跟踪字段逐个相等），对不上就是零写入的 `precondition_mismatch`。
 *    替身仍不执行 SQL：业务表的 `SELECT … IN (…)` 由 {@link answerBusinessSelect} 按布景塞进去的行应答。
 */

import {
  createEntitySyncResolver,
  getEntityMetadata,
  parseRxDBChangeKey,
  SyncType,
  takeDeclaredWrite,
  WorktreeTableSet,
  type EntityType,
  type SwitchVersionActions,
  type SwitchVersionChange
} from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import type { CommitChangeUnitContent } from '../../commit/change-unit.js';
import { computeCommitContentFingerprint } from '../../commit/change-unit.js';
import { CommitChangeSet } from '../../commit/commit-change-set.entity.js';
import type { CommitExchangeRecord } from '../../commit/commit-exchange.js';
import { CommitForkPoint } from '../../commit/commit-fork-point.entity.js';
import { deriveImportedCommitOperationId } from '../../commit/commit-idempotency.js';
import type { CommitKind } from '../../commit/commit.entity.js';
import { Commit } from '../../commit/commit.entity.js';
import { buildCommitRows } from '../../commit/write-commit.js';
import { checkCommitExchangeBatch } from '../../exchange.js';
import { buildDatabaseVersionedDomain, businessEntitiesOf } from '../../working-tree/database-versioned-domain.js';
import {
  importWorkingTreeCommits,
  type CommitImportEnvironment,
  type CommitImportOptions,
  type CommitImportResult
} from '../../working-tree/import-command.js';
import { buildVersionedDomain } from '../../working-tree/versioned-domain.js';
import { fakeTableRef } from '../fixtures/fake-table-ref.js';
import {
  createWorkingTreeScene,
  refRowOf,
  SCENE_BRANCH_ID,
  SceneNote,
  stateRowOf,
  type WorkingTreeScene
} from './fixtures/working-tree-scene.js';

/** 场景里的笔记实体身份；单元都指向它。 */
const NOTE = getEntityMetadata(SceneNote);

/** 本地历史：系统根节点 → H（当前头）。 */
const ROOT = '01937000-0000-7000-8000-000000000000';
const H = '01937000-0000-7000-8000-000000000001';

/** 远端提交 id；UUIDv7 形状，与首个使用方一致。 */
const R1 = '01937000-0000-7000-8000-0000000000a1';
const R2 = '01937000-0000-7000-8000-0000000000a2';
const S1 = '01937000-0000-7000-8000-0000000000b1';
const M = '01937000-0000-7000-8000-0000000000c1';
const REMOTE_ROOT = '01937000-0000-7000-8000-0000000000f0';

/** 远端那一份时间：与本机时钟无关，原样入库。 */
const REMOTE_TIME = new Date('2026-11-01T08:30:00.000Z');

/** 一个落库形态的单元；身份默认指向 {@link NOTE}。 */
const unitOf = (
  entityId: string,
  operation: CommitChangeUnitContent['operation'],
  patch: Record<string, unknown> | null,
  inversePatch: Record<string, unknown> | null,
  overrides: Partial<CommitChangeUnitContent> = {}
): CommitChangeUnitContent => ({
  unitId: `unit-${entityId}-${operation}`,
  transactionId: null,
  namespace: NOTE.namespace,
  entity: NOTE.name,
  entityId,
  operation,
  patch,
  inversePatch,
  origin: 'local',
  ...overrides
});

/** 一条记录的可拨字段；没给的按种类补默认值，指纹按内容现算。 */
interface RecordSeed {
  readonly commitId: string;
  readonly parentIds: readonly string[];
  readonly units?: readonly CommitChangeUnitContent[];
  readonly kind?: CommitKind;
  readonly message?: string;
  readonly authorId?: string | null;
  readonly createdAt?: Date;
}

/** 造一条自洽的交换记录：指纹由写路径同一个函数算，与服务端按规范化规则复算出的是同一个值。 */
const recordOf = (seed: RecordSeed): CommitExchangeRecord => {
  const kind = seed.kind ?? (seed.parentIds.length > 1 ? 'merge' : 'normal');
  const system = kind === 'baseline' || kind === 'branch_baseline';
  const message = seed.message ?? (system ? '远端的基线' : `远端提交 ${seed.commitId.slice(-2)}`);
  const authorId =
    seed.authorId === undefined ?
      system ? null
      : 'server-alice'
    : seed.authorId;
  const units =
    seed.units ?? (system ? [] : [unitOf(`note-${seed.commitId.slice(-2)}`, 'insert', { title: 'x' }, null)]);
  return {
    commitId: seed.commitId,
    parentIds: seed.parentIds,
    kind,
    message,
    authorId,
    createdAt: seed.createdAt ?? REMOTE_TIME,
    contentFingerprint: computeCommitContentFingerprint({
      kind,
      parentIds: seed.parentIds,
      message,
      author: authorId,
      units
    }),
    units
  };
};

/** 往场景里塞一个本库已有的提交（经写路径的 `buildCommitRows()`，守卫才认）。 */
const seedLocalCommit = (scene: WorkingTreeScene, seed: RecordSeed): Commit => {
  const record = recordOf(seed);
  const { commit, changeSets } = buildCommitRows(scene.database.entityManager, {
    id: record.commitId,
    kind: record.kind,
    parentIds: record.parentIds,
    message: record.message,
    author: record.authorId,
    operationId: deriveImportedCommitOperationId(`local-${record.commitId}`),
    units: record.units
  });
  commit.createdAt = new Date('2026-10-01T00:00:00.000Z');
  scene.probe.seed(Commit, [commit]);
  scene.probe.seed(CommitChangeSet, changeSets);
  return commit;
};

/** 业务表的物理名 → 实体；{@link answerBusinessSelect} 只认这几张表。 */
const BUSINESS_TABLES: ReadonlyMap<string, EntityType> = new Map([[fakeTableRef(SceneNote), SceneNote]]);

/** 语句里一个带引号的列名；`CAST("col" AS TEXT)` 里那一个也是它。 */
const QUOTED_COLUMN = /"([^"]+)"/;

/**
 * 替身对前像核对那条 `SELECT <列> FROM <表> WHERE <主键> IN (<字面量>)` 的应答。
 *
 * @remarks
 * 替身不执行 SQL，这一条也不例外：只按语句里点名的列与 `IN` 里的 id，从布景塞进 {@link BUSINESS_TABLES}
 * 那几张表的行里逐列取值，列序就是语句里的列序。认不出的语句（CAS、状态转移）交回空结果集，与没挂钩子时一样。
 */
const answerBusinessSelect = (sql: string, rowsOf: (EntityClass: EntityType) => object[]): unknown[][] => {
  const match = /^SELECT (.+) FROM (\S+) WHERE \S+ IN \((.*)\)$/.exec(sql);
  const EntityClass = match ? BUSINESS_TABLES.get(match[2]) : undefined;
  if (!match || !EntityClass) return [];
  const columns = match[1].split(', ').map(column => QUOTED_COLUMN.exec(column)?.[1] ?? column);
  const ids = new Set([...match[3].matchAll(/'((?:[^']|'')*)'/g)].map(literal => literal[1].replaceAll("''", "'")));
  return (rowsOf(EntityClass) as Record<string, unknown>[])
    .filter(row => ids.has(String(row['id'])))
    .map(row => columns.map(column => row[column] ?? null));
};

/** 本地历史：`ROOT`（启用时写下的基线）→ `H`（当前头，一个普通提交）；业务表停在 H：只有 `note-h` 一行。 */
const sceneAtH = (options: { readonly rowsAffected?: number; readonly tableSet?: WorktreeTableSet } = {}) => {
  const scene = createWorkingTreeScene({ headCommitId: H, headRevision: 3, onQuery: answerBusinessSelect, ...options });
  seedLocalCommit(scene, { commitId: ROOT, parentIds: [], kind: 'baseline' });
  seedLocalCommit(scene, {
    commitId: H,
    parentIds: [ROOT],
    units: [unitOf('note-h', 'insert', { title: 'H' }, null)]
  });
  scene.probe.seed(SceneNote, [{ id: 'note-h', title: 'H' }]);
  return scene;
};

/** 本地历史只有一个系统根节点：刚 `enable()` 过、一次都没提交的库（第二台设备第一次导入的起点）。 */
const sceneAtEmptyBaseline = (): WorkingTreeScene => {
  const scene = createWorkingTreeScene({ headCommitId: ROOT, headRevision: 1, onQuery: answerBusinessSelect });
  seedLocalCommit(scene, { commitId: ROOT, parentIds: [], kind: 'baseline' });
  return scene;
};

/** 分支还没有根：ref 的 HEAD 为空（旧版本 `createBranch()` 留下、还没等到再一次 `enable()` 补根的那一行）。 */
const sceneAtNullHead = (): WorkingTreeScene =>
  createWorkingTreeScene({ headCommitId: null, headRevision: 0, onQuery: answerBusinessSelect });

/** 与捕获运行时同一个构造：版本化域、业务实体、同步配置解析器。 */
const environmentOf = (scene: WorkingTreeScene): CommitImportEnvironment => ({
  domain: buildDatabaseVersionedDomain(scene.adapter, scene.database.config.entities, scene.database.entitySync),
  businessEntities: businessEntitiesOf(scene.database.config.entities),
  entitySync: scene.database.entitySync
});

/** 与场景初值完全对得上的一组捕获型凭据。 */
const credentialsOf = (scene: WorkingTreeScene): CommitImportOptions => ({
  expectedBranch: { branchId: SCENE_BRANCH_ID, activationRevision: 0 },
  expectedHeadRevision: refRowOf(scene).headRevision,
  expectedWorkingTreeRevision: stateRowOf(scene).workingTreeRevision
});

/** 跑一次导入。 */
const importOnce = (
  scene: WorkingTreeScene,
  commits: readonly CommitExchangeRecord[],
  overrides: { readonly environment?: CommitImportEnvironment; readonly options?: CommitImportOptions } = {}
): Promise<CommitImportResult> =>
  importWorkingTreeCommits(
    scene.probe.executor,
    scene.context,
    overrides.environment ?? environmentOf(scene),
    commits,
    overrides.options ?? credentialsOf(scene)
  );

/** 取成功出口。 */
const expectOk = (result: CommitImportResult): Extract<CommitImportResult, { ok: true }> => {
  if (!result.ok) throw new Error(`期望这次导入成功，实际拿到：${JSON.stringify(result)}`);
  return result;
};

/** 一条只读语句：前像核对读业务表发的那几条。 */
const isSelect = (sql: string): boolean => sql.startsWith('SELECT ');

/**
 * 执行器上的写：落行、发写语句、改业务表。被拒的导入一样都不该有。
 *
 * @remarks
 * `query` 按它发出的那条语句分：前像核对的 `SELECT` 是读，不算写。`trace` 与 `statements` 都按调用顺序记，
 * 第 n 个 `query` 就是第 n 条语句。
 */
const writesOf = (scene: WorkingTreeScene): string[] => {
  const statements = [...scene.probe.statements];
  return scene.probe.trace.filter(step =>
    step === 'query' ?
      !isSelect(statements.shift() ?? '')
    : ['saveMany', 'removeMany', 'mergeChanges', 'mutations'].includes(step)
  );
};

/** 发出的写语句，按顺序；前像核对的 `SELECT` 不在其中。 */
const writeStatementsOf = (scene: WorkingTreeScene): string[] => scene.probe.statements.filter(sql => !isSelect(sql));

/** 一个桶按身份摊开成 `namespace:entity:entityId` → 两份补丁。 */
const bucketOf = (bucket: ReadonlyMap<string, SwitchVersionChange>): Record<string, unknown> =>
  Object.fromEntries(
    [...bucket].map(([key, change]) => {
      const [namespace, entity, entityId] = parseRxDBChangeKey(key);
      return [`${namespace}:${entity}:${String(entityId)}`, { patch: change.patch, inversePatch: change.inversePatch }];
    })
  );

/** 每一次 `mergeChanges` 的增删改（三个桶摊开）与另外两个实参。 */
const mergeCallsOf = (scene: WorkingTreeScene) =>
  vi.mocked(scene.probe.executor.mergeChanges).mock.calls.map(([actions, localChanges, disableTriggers]) => ({
    deletes: bucketOf((actions as SwitchVersionActions).deletes),
    updates: bucketOf((actions as SwitchVersionActions).updates),
    inserts: bucketOf((actions as SwitchVersionActions).inserts),
    localChanges,
    disableTriggers
  }));

/** 某个 id 的提交行。 */
const commitRowOf = (scene: WorkingTreeScene, commitId: string): Commit => {
  const row = (scene.probe.rowsOf(Commit) as Commit[]).find(commit => commit.id === commitId);
  if (!row) throw new Error(`提交 ${commitId} 没落库`);
  return row;
};

describe('被拒是返回值，零写入（AC#3 / AC#4 / AC#5）', () => {
  it('工作树有未提交条目：dirty_working_tree', async () => {
    const scene = sceneAtH();
    scene.addEntry();

    const result = await importOnce(scene, [recordOf({ commitId: R1, parentIds: [H] })]);

    expect(result).toEqual({ ok: false, reason: 'dirty_working_tree' });
    expect(writesOf(scene)).toEqual([]);
  });

  it('有未结束的恢复会话（条目已经折没了）：同样是 dirty_working_tree', async () => {
    // HEAD 一动，这个会话就成了一个谁都没造出来的 conflicted 会话
    const scene = sceneAtH();
    scene.addRestoreSession({
      targetCommitId: ROOT,
      expectedHeadRevision: 3,
      expectedWorkingTreeRevision: 0,
      status: 'active'
    });

    const result = await importOnce(scene, [recordOf({ commitId: R1, parentIds: [H] })]);

    expect(result).toEqual({ ok: false, reason: 'dirty_working_tree' });
    expect(writesOf(scene)).toEqual([]);
  });

  it('三个捕获位对不上：conflict，带上真实的当前值', async () => {
    const scene = sceneAtH();

    const result = await importOnce(scene, [recordOf({ commitId: R1, parentIds: [H] })], {
      options: { ...credentialsOf(scene), expectedHeadRevision: 2 }
    });

    expect(result).toEqual({
      ok: false,
      reason: 'conflict',
      conflict: { kind: 'head_revision', expected: 2, actual: 3, branchId: SCENE_BRANCH_ID }
    });
    expect(writesOf(scene)).toEqual([]);
  });

  it('挂在可写检出位上：not_main_checkout（只有主检出位同步）', async () => {
    const scene = sceneAtH({ tableSet: WorktreeTableSet.of('wt_import', []) });

    const result = await importOnce(scene, [recordOf({ commitId: R1, parentIds: [H] })]);

    expect(result).toEqual({ ok: false, reason: 'not_main_checkout' });
    expect(writesOf(scene)).toEqual([]);
  });

  it('链首的父不是当前头：not_fast_forward（本地有服务端不知道的提交）', async () => {
    const scene = sceneAtH();

    const result = await importOnce(scene, [recordOf({ commitId: R1, parentIds: [ROOT] })]);

    expect(result).toEqual({ ok: false, reason: 'not_fast_forward', headCommitId: H });
    expect(writesOf(scene)).toEqual([]);
  });

  it('当前头只是新头的非第一父：not_fast_forward（快进只沿第一父链判定）', async () => {
    // 服务端把本地这条线作为第二父并进了另一条主线；要导入，服务端得以本地当前头为第一父建合并提交
    const scene = sceneAtH();
    const other = recordOf({ commitId: S1, parentIds: [ROOT] });
    const merge = recordOf({ commitId: M, parentIds: [S1, H] });

    const result = await importOnce(scene, [other, merge]);

    expect(result).toEqual({ ok: false, reason: 'not_fast_forward', headCommitId: H });
    expect(writesOf(scene)).toEqual([]);
  });

  it('某个提交的指纹与内容不符：整批 fingerprint_mismatch', async () => {
    const scene = sceneAtH();
    const good = recordOf({ commitId: R1, parentIds: [H] });
    const tampered = { ...recordOf({ commitId: R2, parentIds: [R1] }), message: '被改过的消息' };

    const result = await importOnce(scene, [good, tampered]);

    expect(result).toEqual({ ok: false, reason: 'fingerprint_mismatch', commitId: R2 });
    expect(writesOf(scene)).toEqual([]);
  });

  it('本库已有同 id 的提交，内容不同：commit_id_conflict', async () => {
    const scene = sceneAtH();
    // 记录自己是自洽的（声明的指纹等于按内容复算的），只是与本库那个 H 不是同一个提交
    const impostor = recordOf({ commitId: H, parentIds: [ROOT], message: '同 id、另一份内容' });

    const result = await importOnce(scene, [impostor]);

    expect(result).toEqual({ ok: false, reason: 'commit_id_conflict', commitId: H });
    expect(writesOf(scene)).toEqual([]);
  });

  it('合并提交的第二父本地没有、批次里也没有：missing_parent（不收浅父）', async () => {
    const scene = sceneAtH();

    const result = await importOnce(scene, [recordOf({ commitId: M, parentIds: [H, S1] })]);

    expect(result).toEqual({ ok: false, reason: 'missing_parent', commitId: M, parentId: S1 });
    expect(writesOf(scene)).toEqual([]);
  });

  it('单元指向本客户端没注册的实体：unsupported_entity / unregistered', async () => {
    const scene = sceneAtH();
    const ghost = unitOf('ghost-1', 'insert', { name: '?' }, null, { entity: 'Ghost' });

    const result = await importOnce(scene, [recordOf({ commitId: R1, parentIds: [H], units: [ghost] })]);

    expect(result).toEqual({
      ok: false,
      reason: 'unsupported_entity',
      problem: 'unregistered',
      commitId: R1,
      namespace: NOTE.namespace,
      entity: 'Ghost'
    });
    expect(writesOf(scene)).toEqual([]);
  });

  it('要叠到业务表上的实体走通用同步推送：unsupported_entity / synced', async () => {
    // 导入写下的变更日志会被通用同步当成本地编辑推回去——同一批实体上两者不能同时用
    const scene = sceneAtH();
    const environment: CommitImportEnvironment = {
      ...environmentOf(scene),
      entitySync: createEntitySyncResolver({
        type: SyncType.Full,
        local: { adapter: 'local' },
        remote: { adapter: 'remote' }
      })
    };

    const result = await importOnce(scene, [recordOf({ commitId: R1, parentIds: [H] })], { environment });

    expect(result).toMatchObject({ ok: false, reason: 'unsupported_entity', problem: 'synced', commitId: R1 });
    expect(writesOf(scene)).toEqual([]);
  });

  it('要叠到业务表上的实体不受版本控制：unsupported_entity / untracked', async () => {
    const scene = sceneAtH();
    const environment: CommitImportEnvironment = {
      ...environmentOf(scene),
      domain: buildVersionedDomain([
        {
          entityName: NOTE.name,
          namespace: NOTE.namespace,
          physicalTableNames: [NOTE.tableName],
          syncType: SyncType.QueryCache
        }
      ])
    };

    const result = await importOnce(scene, [recordOf({ commitId: R1, parentIds: [H] })], { environment });

    expect(result).toMatchObject({ ok: false, reason: 'unsupported_entity', problem: 'untracked', commitId: R1 });
    expect(writesOf(scene)).toEqual([]);
  });

  it('侧枝提交只查注册、不查能不能写：它的 ChangeSet 不落业务表', async () => {
    const scene = sceneAtH();
    const environment: CommitImportEnvironment = {
      ...environmentOf(scene),
      entitySync: createEntitySyncResolver({
        type: SyncType.Full,
        local: { adapter: 'local' },
        remote: { adapter: 'remote' }
      })
    };
    const side = recordOf({ commitId: S1, parentIds: [ROOT] });
    const merge = recordOf({ commitId: M, parentIds: [H, S1], units: [] });

    const result = await importOnce(scene, [side, merge], { environment });

    // 合并提交没有单元，第一父链上没有要写的实体；侧枝那个单元指向走同步推送的实体，但它不落业务表
    expect(expectOk(result)).toMatchObject({ importedCount: 2, appliedCount: 1 });
  });
});

describe('前像核对：每个单元写之前的那一行，要与叠到它时的业务行对得上（precondition_mismatch）', () => {
  /** 对不上的那个单元：只报身份与操作，不带字段值（诊断里不出现内容）。 */
  const mismatchAt = (commitId: string, unit: CommitChangeUnitContent): CommitImportResult => ({
    ok: false,
    reason: 'precondition_mismatch',
    commitId,
    unitId: unit.unitId,
    namespace: unit.namespace,
    entity: unit.entity,
    entityId: unit.entityId,
    operation: unit.operation
  });

  it('insert：这一行已经在本机业务表里——整批拒绝，一个字节都不写', async () => {
    const scene = sceneAtH();
    const unit = unitOf('note-h', 'insert', { title: 'H' }, null);

    const result = await importOnce(scene, [recordOf({ commitId: R1, parentIds: [H], units: [unit] })]);

    expect(result).toEqual(mismatchAt(R1, unit));
    expect(writesOf(scene)).toEqual([]);
  });

  it('update：这一行在，但 inversePatch 覆盖的跟踪字段与本机当前值不同——服务端的增量不是相对本机这份数据算的', async () => {
    const scene = sceneAtH();
    const unit = unitOf('note-h', 'update', { title: '改名' }, { title: '服务端以为的旧值' });

    const result = await importOnce(scene, [recordOf({ commitId: R1, parentIds: [H], units: [unit] })]);

    expect(result).toEqual(mismatchAt(R1, unit));
    expect(writesOf(scene)).toEqual([]);
  });

  it('update：这一行本机没有——拒绝，而不是让一条打空的 UPDATE 静默落空', async () => {
    const scene = sceneAtH();
    const unit = unitOf('note-ghost', 'update', { title: '改名' }, { title: '旧' });

    const result = await importOnce(scene, [recordOf({ commitId: R1, parentIds: [H], units: [unit] })]);

    expect(result).toEqual(mismatchAt(R1, unit));
    expect(writesOf(scene)).toEqual([]);
  });

  it('delete：这一行在，但与 inversePatch 不一致——拒绝', async () => {
    const scene = sceneAtH();
    const unit = unitOf('note-h', 'delete', null, { title: '不是本机这一行' });

    const result = await importOnce(scene, [recordOf({ commitId: R1, parentIds: [H], units: [unit] })]);

    expect(result).toEqual(mismatchAt(R1, unit));
    expect(writesOf(scene)).toEqual([]);
  });

  it('delete：这一行本机没有——拒绝，而不是让一条打空的 DELETE 静默落空', async () => {
    const scene = sceneAtH();
    const unit = unitOf('note-ghost', 'delete', null, { title: '旧' });

    const result = await importOnce(scene, [recordOf({ commitId: R1, parentIds: [H], units: [unit] })]);

    expect(result).toEqual(mismatchAt(R1, unit));
    expect(writesOf(scene)).toEqual([]);
  });

  it('链式：后一个提交的前像是前一个提交叠完之后的那一行，不是导入之前的业务表', async () => {
    const scene = sceneAtH();
    const first = recordOf({
      commitId: R1,
      parentIds: [H],
      units: [unitOf('note-h', 'update', { title: 'H1' }, { title: 'H' })]
    });
    const second = recordOf({
      commitId: R2,
      parentIds: [R1],
      units: [unitOf('note-h', 'update', { title: 'H2' }, { title: 'H1' })]
    });

    const result = await importOnce(scene, [first, second]);

    expect(expectOk(result)).toMatchObject({ headCommitId: R2, appliedCount: 2 });
    expect(mergeCallsOf(scene)).toHaveLength(2);
  });

  it('链式：后一个提交的前像按导入之前的业务表算（漏掉了前一个提交）——拒在后一个提交上，前一个也不写', async () => {
    const scene = sceneAtH();
    const first = recordOf({
      commitId: R1,
      parentIds: [H],
      units: [unitOf('note-h', 'update', { title: 'H1' }, { title: 'H' })]
    });
    const stale = unitOf('note-h', 'update', { title: 'H2' }, { title: 'H' });
    const second = recordOf({ commitId: R2, parentIds: [R1], units: [stale] });

    const result = await importOnce(scene, [first, second]);

    expect(result).toEqual(mismatchAt(R2, stale));
    expect(writesOf(scene)).toEqual([]);
  });

  it('链式：批内先插入、再修改、再删除同一行——每一步对的都是上一步之后的那一行，删掉之后再插回也成立', async () => {
    const scene = sceneAtH();
    const created = recordOf({
      commitId: R1,
      parentIds: [H],
      units: [unitOf('note-new', 'insert', { title: '新' }, null)]
    });
    const edited = recordOf({
      commitId: R2,
      parentIds: [R1],
      units: [
        unitOf('note-new', 'update', { title: '新改' }, { title: '新' }),
        unitOf('note-new', 'delete', null, { title: '新改' }, { unitId: 'unit-note-new-delete' }),
        unitOf('note-new', 'insert', { title: '重建' }, null, { unitId: 'unit-note-new-reinsert' })
      ]
    });

    expect(expectOk(await importOnce(scene, [created, edited]))).toMatchObject({ headCommitId: R2, appliedCount: 2 });
  });

  it('簿记字段（updatedAt）与 readonly 的审计列（createdBy / updatedBy）不参与比对：只比跟踪的业务字段', async () => {
    // updatedAt 由适配器按「此刻」重写；readonly 列被 mergeChanges 的 UPDATE 剥掉，导入设备上它们本就不随远端收敛
    const scene = sceneAtH();
    const unit = unitOf(
      'note-h',
      'update',
      { title: '改名', updatedAt: '2026-11-17T00:00:00.000Z', updatedBy: 'server-bob' },
      { title: 'H', updatedAt: '2001-01-01T00:00:00.000Z', updatedBy: '另一台设备上的人', createdBy: '谁都行' }
    );

    expectOk(await importOnce(scene, [recordOf({ commitId: R1, parentIds: [H], units: [unit] })]));
  });

  it('inversePatch 里有本客户端认不出的列：核对不了就拒，而不是跳过它', async () => {
    const scene = sceneAtH();
    const unit = unitOf('note-h', 'update', { title: '改名' }, { title: 'H', ghost: 1 });

    const result = await importOnce(scene, [recordOf({ commitId: R1, parentIds: [H], units: [unit] })]);

    expect(result).toEqual(mismatchAt(R1, unit));
    expect(writesOf(scene)).toEqual([]);
  });

  it('只发读语句、排在 HEAD 的 CAS 之前：每个实体一条 SELECT … IN，主键加上要比的列', async () => {
    const scene = sceneAtH();
    const units = [
      unitOf('note-h', 'update', { title: '改名' }, { title: 'H' }),
      unitOf('note-1', 'insert', { title: '一' }, null)
    ];

    expectOk(await importOnce(scene, [recordOf({ commitId: R1, parentIds: [H], units })]));

    const statements = scene.probe.statements;
    expect(statements.filter(isSelect)).toEqual([
      `SELECT "id", "title" FROM ${fakeTableRef(SceneNote)} WHERE "id" IN ('note-h', 'note-1')`
    ]);
    expect(statements.findIndex(isSelect)).toBeLessThan(statements.findIndex(sql => sql.startsWith('UPDATE ')));
  });

  it('侧枝提交不核对：它的 ChangeSet 不落业务表，叠上去的只有第一父链', async () => {
    // 侧枝与合并提交插入同一行：若把侧枝也算进来，合并提交那条插入就会撞上「这一行已经在了」
    const scene = sceneAtH();
    const side = recordOf({
      commitId: S1,
      parentIds: [ROOT],
      units: [unitOf('note-task', 'insert', { title: '任务分支上的草稿' }, null)]
    });
    const merge = recordOf({
      commitId: M,
      parentIds: [H, S1],
      units: [unitOf('note-task', 'insert', { title: '任务分支上的草稿' }, null)]
    });

    expect(expectOk(await importOnce(scene, [side, merge]))).toMatchObject({ headCommitId: M, appliedCount: 1 });
  });
});

describe('批次形状（invalid_batch）', () => {
  const at = (scene: WorkingTreeScene, commits: readonly unknown[]) =>
    importOnce(scene, commits as readonly CommitExchangeRecord[]);

  it.each([
    ['empty_batch', () => [], null],
    ['invalid_commit_id', () => [{ ...recordOf({ commitId: R1, parentIds: [H] }), commitId: '  ' }], null],
    [
      'duplicate_commit',
      () => [recordOf({ commitId: R1, parentIds: [H] }), recordOf({ commitId: R1, parentIds: [H] })],
      R1
    ],
    ['invalid_kind', () => [{ ...recordOf({ commitId: R1, parentIds: [H] }), kind: 'squash' }], R1],
    ['invalid_parents', () => [recordOf({ commitId: R1, parentIds: [H, ROOT], kind: 'normal' })], R1],
    ['invalid_parents', () => [recordOf({ commitId: M, parentIds: [H], kind: 'merge' })], M],
    ['invalid_parents', () => [recordOf({ commitId: M, parentIds: [H, H], kind: 'merge' })], M],
    ['invalid_parents', () => [recordOf({ commitId: R1, parentIds: [R1] })], R1],
    ['invalid_message', () => [recordOf({ commitId: R1, parentIds: [H], message: '   ' })], R1],
    ['invalid_author', () => [recordOf({ commitId: R1, parentIds: [H], authorId: null })], R1],
    [
      'invalid_author',
      () => [recordOf({ commitId: REMOTE_ROOT, parentIds: [], kind: 'baseline', authorId: 'mallory' })],
      REMOTE_ROOT
    ],
    [
      'invalid_created_at',
      () => [{ ...recordOf({ commitId: R1, parentIds: [H] }), createdAt: '2026-11-01T08:30:00.000Z' }],
      R1
    ],
    ['invalid_units', () => [recordOf({ commitId: R1, parentIds: [H], units: [] })], R1],
    [
      'invalid_unit',
      () => [
        recordOf({
          commitId: R1,
          parentIds: [H],
          units: [unitOf('note-x', 'insert', { title: 'x' }, null, { transactionId: 'not-a-uuid' })]
        })
      ],
      R1
    ],
    [
      'invalid_unit',
      () => [recordOf({ commitId: R1, parentIds: [H], units: [unitOf('note-x', 'update', null, null)] })],
      R1
    ],
    [
      'not_topological',
      () => [recordOf({ commitId: R2, parentIds: [R1] }), recordOf({ commitId: R1, parentIds: [H] })],
      R2
    ],
    [
      'unreachable_from_head',
      () => [recordOf({ commitId: S1, parentIds: [ROOT] }), recordOf({ commitId: R1, parentIds: [H] })],
      S1
    ]
  ] as const)('%s', async (problem, build, commitId) => {
    const scene = sceneAtH();
    const batch = build();

    const result = await at(scene, batch);

    expect(result).toEqual({ ok: false, reason: 'invalid_batch', problem, commitId });
    // 服务端从 `./exchange` 拿到的就是导入命令用的那一个判定：判出的毛病与 invalid_batch 逐字相同
    expect(checkCommitExchangeBatch(batch as readonly CommitExchangeRecord[])).toEqual({ problem, commitId });
    expect(writesOf(scene)).toEqual([]);
  });
});

describe('导入一段提交链：身份原样、分支头快进（AC#1 / AC#2）', () => {
  it('从当前头延续：先打 CAS，再写节点、逐个叠业务表、推工作树基线', async () => {
    const scene = sceneAtH();
    const first = recordOf({
      commitId: R1,
      parentIds: [H],
      units: [unitOf('note-1', 'insert', { title: '一' }, null)]
    });
    const second = recordOf({
      commitId: R2,
      parentIds: [R1],
      authorId: 'server-bob',
      units: [
        unitOf('note-1', 'update', { title: '一改' }, { title: '一' }),
        unitOf('note-h', 'delete', null, { title: 'H' })
      ]
    });

    const result = expectOk(await importOnce(scene, [first, second]));

    expect(result).toEqual({ ok: true, headCommitId: R2, headRevision: 4, importedCount: 2, appliedCount: 2 });
    // CAS 排第一：落空时一个字节都不该落；两个提交各叠一次业务表；最后推工作树基线
    expect(writesOf(scene)).toEqual([
      'query',
      'saveMany',
      'saveMany',
      'mergeChanges',
      'saveMany',
      'mergeChanges',
      'saveMany',
      'query'
    ]);
    const [cas, transition] = writeStatementsOf(scene);
    expect(cas).toMatch(/UPDATE .*"headCommitId" = '01937000-0000-7000-8000-0000000000a2'/);
    expect(cas).toMatch(/"headRevision" = 4 WHERE .*"generation" = 1 AND "headRevision" = 3 AND "status" = 'ok'/);
    expect(transition).toMatch(/"baseHeadCommitId" = '01937000-0000-7000-8000-0000000000a2' WHERE "id" = 'main'/);
    expect(transition).not.toMatch(/workingTreeRevision|entryCount/);
  });

  it('提交 id、父链、种类、作者、消息、时间与指纹逐字落库；工作树基线与条目一格都不动', async () => {
    const scene = sceneAtH();
    const first = recordOf({ commitId: R1, parentIds: [H], message: '  首尾带空白的消息  ' });
    const second = recordOf({ commitId: R2, parentIds: [R1], authorId: 'server-bob' });

    expectOk(await importOnce(scene, [first, second]));

    for (const record of [first, second]) {
      const row = commitRowOf(scene, record.commitId);
      expect({
        parentIds: row.parentIds,
        firstParentId: row.firstParentId,
        kind: row.kind,
        message: row.message,
        author: row.author,
        createdAt: row.createdAt,
        contentFingerprint: row.contentFingerprint,
        changeSetCount: row.changeSetCount,
        operationId: row.operationId
      }).toEqual({
        parentIds: record.parentIds,
        firstParentId: record.parentIds[0],
        kind: record.kind,
        // 原样，不 trim：消息参与指纹，改一个字节守卫就会把它判成损坏
        message: record.message,
        author: record.authorId,
        createdAt: REMOTE_TIME,
        contentFingerprint: record.contentFingerprint,
        changeSetCount: record.units.length,
        operationId: deriveImportedCommitOperationId(record.commitId)
      });
    }
    expect(stateRowOf(scene).entryCount).toBe(0);
  });

  it('每个新到的第一父链提交一次 mergeChanges：按 sequence 叠，触发器开着，不带本地变更日志行', async () => {
    const scene = sceneAtH();
    const first = recordOf({
      commitId: R1,
      parentIds: [H],
      units: [unitOf('note-1', 'insert', { title: '一' }, null)]
    });
    const second = recordOf({
      commitId: R2,
      parentIds: [R1],
      units: [
        unitOf('note-2', 'insert', { title: '二' }, null),
        unitOf('note-2', 'update', { title: '二改' }, { title: '二' }, { unitId: 'unit-note-2-update-2' })
      ]
    });

    expectOk(await importOnce(scene, [first, second]));

    expect(mergeCallsOf(scene)).toEqual([
      {
        deletes: {},
        updates: {},
        inserts: { 'app:Note:note-1': { patch: { title: '一' }, inversePatch: null } },
        localChanges: undefined,
        disableTriggers: false
      },
      {
        // 同一行在一个提交里写两次（服务端的合并结果可以这样）：正向折成一条插入，`patch` 取最后的值。
        // `inversePatch` 是切分支那一份折叠留下的最早那次修改的反向值——插入只读 `patch`，它不参与写
        deletes: {},
        updates: {},
        inserts: { 'app:Note:note-2': { patch: { title: '二改' }, inversePatch: { title: '二' } } },
        localChanges: undefined,
        disableTriggers: false
      }
    ]);
  });

  it('声明在 mergeChanges 被调到的那一刻挂在执行器上：登记表 #17，入口是投影重写', async () => {
    const scene = sceneAtH();
    const executor = scene.probe.executor;
    const declared: unknown[] = [];
    vi.mocked(executor.mergeChanges).mockImplementation(async () => {
      declared.push(takeDeclaredWrite(executor));
    });

    expectOk(await importOnce(scene, [recordOf({ commitId: R1, parentIds: [H] })]));

    expect(declared).toEqual([
      {
        file: 'import-command.ts',
        symbol: 'applyImportedCommit',
        intent: 'remote_commit_import',
        entrance: 'projection_rewrite'
      }
    ]);
    // 没有要写的就不留声明：留下的声明会被挂载点 1 在事务末尾取走，把别的写都按投影重写放过去
    expect(takeDeclaredWrite(executor)).toBeUndefined();
  });

  it('每个叠上去的提交记下分叉点（从它建分支读到它刚完成时的数据）', async () => {
    const scene = sceneAtH();

    expectOk(
      await importOnce(scene, [recordOf({ commitId: R1, parentIds: [H] }), recordOf({ commitId: R2, parentIds: [R1] })])
    );

    expect((scene.probe.rowsOf(CommitForkPoint) as CommitForkPoint[]).map(row => [row.id, row.branchId])).toEqual([
      [R1, SCENE_BRANCH_ID],
      [R2, SCENE_BRANCH_ID]
    ]);
  });

  it('叠业务表抛错原样上抛：节点写过了，但之后的提交不再叠、工作树基线不推（整笔回滚靠调用方的事务）', async () => {
    const scene = sceneAtH();
    const injected = new Error('注入：业务表写失败');
    vi.mocked(scene.probe.executor.mergeChanges).mockRejectedValueOnce(injected);

    const error = await importOnce(scene, [
      recordOf({ commitId: R1, parentIds: [H] }),
      recordOf({ commitId: R2, parentIds: [R1] })
    ]).then(
      () => null,
      (caught: unknown) => caught
    );

    expect(error).toBe(injected);
    expect(scene.probe.executor.mergeChanges).toHaveBeenCalledTimes(1);
    // 只有 CAS 那一条写语句发出去了；真实后端上的整笔回滚由一致性套件证
    expect(writeStatementsOf(scene)).toHaveLength(1);
  });

  it('HEAD 的 CAS 没命中：conflict，一个节点都不写、业务表一行都不动', async () => {
    const scene = sceneAtH({ rowsAffected: 0 });

    const result = await importOnce(scene, [recordOf({ commitId: R1, parentIds: [H] })]);

    expect(result).toMatchObject({ ok: false, reason: 'conflict', conflict: { kind: 'head_revision' } });
    expect(writesOf(scene)).toEqual(['query']);
  });
});

describe('合并提交（AC#6）', () => {
  it('以 merge 入库、两个父；侧枝提交只作为节点入库，只有合并提交的 ChangeSet 叠到业务表上', async () => {
    const scene = sceneAtH();
    // 任务分支从 ROOT 分出、改了一行；合并提交相对第一父（当前头 H）的增量把那一行带进主线
    const side = recordOf({
      commitId: S1,
      parentIds: [ROOT],
      authorId: 'server-carol',
      units: [unitOf('note-task', 'insert', { title: '任务分支上的草稿' }, null)]
    });
    const merge = recordOf({
      commitId: M,
      parentIds: [H, S1],
      message: '合并任务分支',
      units: [unitOf('note-task', 'insert', { title: '任务分支上的草稿' }, null)]
    });

    const result = expectOk(await importOnce(scene, [side, merge]));

    expect(result).toEqual({ ok: true, headCommitId: M, headRevision: 4, importedCount: 2, appliedCount: 1 });
    expect(commitRowOf(scene, M)).toMatchObject({ kind: 'merge', parentIds: [H, S1], firstParentId: H });
    expect(commitRowOf(scene, S1)).toMatchObject({ kind: 'normal', parentIds: [ROOT] });
    expect(mergeCallsOf(scene)).toHaveLength(1);
    // 侧枝提交从没落到这条分支的业务表上，也就没有「它刚完成时」的位置可记
    expect((scene.probe.rowsOf(CommitForkPoint) as CommitForkPoint[]).map(row => row.id)).toEqual([M]);
  });

  it('只记下祖先关系的合并（空 ChangeSet）：不叠业务表、不留声明，分支头照样快进', async () => {
    const scene = sceneAtH();
    const side = recordOf({ commitId: S1, parentIds: [ROOT] });
    const merge = recordOf({ commitId: M, parentIds: [H, S1], units: [] });

    const result = expectOk(await importOnce(scene, [side, merge]));

    expect(result).toMatchObject({ headCommitId: M, appliedCount: 1 });
    expect(scene.probe.executor.mergeChanges).not.toHaveBeenCalled();
    expect(takeDeclaredWrite(scene.probe.executor)).toBeUndefined();
  });
});

describe('幂等（AC#5）', () => {
  it('同一批再导入一次：一个字节都不写的成功，HEAD 修订号不涨', async () => {
    const scene = sceneAtH();
    const batch = [recordOf({ commitId: R1, parentIds: [H] }), recordOf({ commitId: R2, parentIds: [R1] })];
    for (const record of batch) seedLocalCommit(scene, record);
    refRowOf(scene).headCommitId = R2;

    const result = await importOnce(scene, batch);

    expect(result).toEqual({ ok: true, headCommitId: R2, headRevision: 3, importedCount: 0, appliedCount: 0 });
    expect(writesOf(scene)).toEqual([]);
  });

  it('导入之后本地又提交过：旧批次再来一次仍是 no-op，不当成分叉拒掉', async () => {
    // 旧批次的新头（这里是 ROOT）已经是当前头 H 的祖先：它在历史里，没有东西要叠
    const scene = sceneAtH();
    const stale = recordOf({ commitId: ROOT, parentIds: [], kind: 'baseline' });

    const result = await importOnce(scene, [stale]);

    expect(result).toEqual({ ok: true, headCommitId: H, headRevision: 3, importedCount: 0, appliedCount: 0 });
    expect(writesOf(scene)).toEqual([]);
  });

  it('同 id 已在本库、本库的时间与远端不同：判同一性只看指纹，保留本地那一份时间', async () => {
    const scene = sceneAtH();
    const local = seedLocalCommit(scene, { commitId: R1, parentIds: [H] });
    const fromServer = {
      ...recordOf({ commitId: R1, parentIds: [H] }),
      createdAt: new Date('2030-01-01T00:00:00.000Z')
    };
    const next = recordOf({ commitId: R2, parentIds: [R1] });

    const result = expectOk(await importOnce(scene, [fromServer, next]));

    // R1 在本库但不在这条分支的历史里（当前头还是 H）：节点不重写，ChangeSet 照样叠到本分支的业务表上
    expect(result).toMatchObject({ headCommitId: R2, importedCount: 1, appliedCount: 2 });
    expect(commitRowOf(scene, R1)).toBe(local);
    expect(local.createdAt).toEqual(new Date('2026-10-01T00:00:00.000Z'));
  });

  it('快进链的下半段落在本库已有、却不在批次里的提交上：从本库读它的单元叠上去', async () => {
    // 一个在别的分支上提交过、被服务端快进进主线的提交：节点不属于任何分支，落没落到本分支的业务表看的是可达性
    const scene = sceneAtH();
    seedLocalCommit(scene, {
      commitId: R1,
      parentIds: [H],
      units: [unitOf('note-elsewhere', 'insert', { title: '别处提交的' }, null)]
    });

    const result = expectOk(await importOnce(scene, [recordOf({ commitId: R2, parentIds: [R1] })]));

    expect(result).toMatchObject({ headCommitId: R2, importedCount: 1, appliedCount: 2 });
    expect(mergeCallsOf(scene).map(call => Object.keys(call.inserts))).toEqual([
      ['app:Note:note-elsewhere'],
      ['app:Note:note-a2']
    ]);
  });
});

describe('空分支起步（AC#1）', () => {
  it('HEAD 是系统根节点、业务表没有行：链可以从另一个根开始，根与链上每个提交都入库', async () => {
    const scene = sceneAtEmptyBaseline();
    const remoteRoot = recordOf({ commitId: REMOTE_ROOT, parentIds: [], kind: 'baseline' });
    const first = recordOf({ commitId: R1, parentIds: [REMOTE_ROOT] });

    const result = expectOk(await importOnce(scene, [remoteRoot, first]));

    expect(result).toEqual({ ok: true, headCommitId: R1, headRevision: 2, importedCount: 2, appliedCount: 2 });
    expect(commitRowOf(scene, REMOTE_ROOT)).toMatchObject({ kind: 'baseline', author: null, parentIds: [] });
    // 远端根节点没有单元：只有 R1 叠了一次业务表
    expect(mergeCallsOf(scene)).toHaveLength(1);
  });

  it('业务表里已经有行：不是空分支，链从另一个根开始就是 not_fast_forward', async () => {
    // 本地基线下压着的那批存量数据不在任何提交里，换根之后就成了说不清来历的数据
    const scene = sceneAtEmptyBaseline();
    scene.probe.seed(SceneNote, [scene.database.entityManager.instantiate(SceneNote)]);

    const result = await importOnce(scene, [
      recordOf({ commitId: REMOTE_ROOT, parentIds: [], kind: 'baseline' }),
      recordOf({ commitId: R1, parentIds: [REMOTE_ROOT] })
    ]);

    expect(result).toEqual({ ok: false, reason: 'not_fast_forward', headCommitId: ROOT });
    expect(writesOf(scene)).toEqual([]);
  });

  it('HEAD 为空、业务表没有行：与系统根节点同样是空分支，链从根开始整条入库', async () => {
    const scene = sceneAtNullHead();
    const remoteRoot = recordOf({ commitId: REMOTE_ROOT, parentIds: [], kind: 'baseline' });
    const first = recordOf({ commitId: R1, parentIds: [REMOTE_ROOT] });

    const result = expectOk(await importOnce(scene, [remoteRoot, first]));

    expect(result).toEqual({ ok: true, headCommitId: R1, headRevision: 1, importedCount: 2, appliedCount: 2 });
    expect(mergeCallsOf(scene)).toHaveLength(1);
  });

  it('HEAD 为空、业务表里已经有行：同样不是空分支，not_fast_forward，零写入', async () => {
    // 空 HEAD 不等于空状态：这些行同样不在任何提交里，从链根接上去它们就成了说不清来历的数据
    const scene = sceneAtNullHead();
    scene.probe.seed(SceneNote, [{ id: 'note-legacy', title: '存量' }]);

    const result = await importOnce(scene, [
      recordOf({ commitId: REMOTE_ROOT, parentIds: [], kind: 'baseline' }),
      recordOf({ commitId: R1, parentIds: [REMOTE_ROOT] })
    ]);

    expect(result).toEqual({ ok: false, reason: 'not_fast_forward', headCommitId: null });
    expect(writesOf(scene)).toEqual([]);
  });

  it('HEAD 是普通提交：不是空分支，链从另一个根开始就是 not_fast_forward', async () => {
    const scene = sceneAtH();

    const result = await importOnce(scene, [
      recordOf({ commitId: REMOTE_ROOT, parentIds: [], kind: 'baseline' }),
      recordOf({ commitId: R1, parentIds: [REMOTE_ROOT] })
    ]);

    expect(result).toEqual({ ok: false, reason: 'not_fast_forward', headCommitId: H });
  });
});
