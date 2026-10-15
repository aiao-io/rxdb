/**
 * @fileoverview 红测试：FR-038 的 at-rest 断言与解码器**真的接在生产路径上**。
 *
 * @remarks
 * `commit-codec.spec.ts` 已经钉死了 `assertCommitUnitsEncryptedAtRest` 判得对不对，
 * 而它**整层曾经是死代码**：零生产调用点。判得再对也拦不住任何一次提交，
 * 且那种状态下整个套件是全绿的——没有任何一条既有断言会因此变红。
 *
 * 所以本文件断言的不是判定口径，而是**调用关系**：
 *
 * 1. `writeCommit` 会调用它；
 * 2. 调用**排在两次指纹计算之前**。`computeCommitContentFingerprint` 会把加密列的值压进
 *    一个 SHA-256，先算指纹再校验，等于给一个落进加密列的明文留下确证——拿到库但没有密钥
 *    的人可以拿 `rxdb_commit.contentFingerprint` 做确认预言机。这条顺序不能靠读代码保证，
 *    因为把断言挪到 `buildCommitRows` 之后不会让任何东西变红。钉死的形式是
 *    **抛出时一次读都没发过**（`probe.finds` 为空）：读 ref 是写路径的第一步，
 *    它之后才轮得到幂等查重的指纹与 `buildCommitRows` 的指纹。
 * 3. **幂等重放那一条也必须过断言**。重放路径自己算一次指纹去比对，绕过断言的话，
 *    「第二次提交同一个 operationId」就成了写入明文指纹的后门。
 * 4. 缺判定器时 fail-closed。适配器侧的槽位是可选的（`RxDBAdapterLocalBase.isEncryptedAtRest`），
 *    于是「没实现 ⇒ 上下文里没有 ⇒ 跳过检查」是这条线最自然也最危险的退化形态。
 *
 * 另有一组断言盯着 `createCommitWriteContext`：它是槽位到 codec 上下文之间那一句转发，
 * 写错的形态（忘了绑 `this`、缺席时补一个恒真的兜底）都不会让上面任何一条变红。
 */

import type { EntityManager, EntityMetadata } from '@aiao/rxdb';
import { RxDB, SyncType } from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import type { CommitChangeUnit } from '../../commit/change-unit.js';
import { computeChangeUnitFingerprint } from '../../commit/change-unit.js';
import { CommitBranchRef } from '../../commit/commit-branch-ref.entity.js';
import { CommitEncryptedAtRestError } from '../../commit/commit-codec.js';
import type { CommitWriteContext } from '../../commit/commit-context.js';
import { createCommitWriteContext } from '../../commit/commit-context.js';
import { deriveCommitOperationId } from '../../commit/commit-idempotency.js';
import { Commit } from '../../commit/commit.entity.js';
import type { WriteCommitInput } from '../../commit/write-commit.js';
import { buildCommitRows, writeCommit } from '../../commit/write-commit.js';
import { rxDBPluginWorkingTree } from '../../plugin.js';
import { createMockAdapter, MockLocalAdapter } from '../fixtures/test-db-setup.js';
import { createCommitGraphProbe } from './fixtures/commit-graph-probe.js';
import { codecWith, ENVELOPE, isEnvelopeLike, SENTINEL } from './fixtures/encrypted-entities.js';

const CALLER_OPERATION_ID = '00000000-0000-4000-8000-0000000000bb';

function createEntityManager(): EntityManager {
  const database = new RxDB({
    dbName: `rxdb-commit-at-rest-${Math.random().toString(36).slice(2)}`,
    entities: [],
    sync: { local: { adapter: 'local' }, type: SyncType.None }
  });
  database.adapter('local', db => createMockAdapter(db));
  database.use(rxDBPluginWorkingTree);
  database.init();
  return database.entityManager;
}

/**
 * 造一份写上下文。
 *
 * @remarks
 * 这里手写对象字面量而不是走 {@link createCommitWriteContext}：后者要一个适配器，
 * 而适配器只有 `connect()` 过的库才拿得到（`RxDB.localAdapterSync` 在未连接的库上抛），
 * 本文件的库全都只 `init()`。两条路各有一组断言，见文件末尾那个 describe。
 */
const contextWith = (entityManager: EntityManager, recognize?: typeof isEnvelopeLike): CommitWriteContext => ({
  entityManager,
  codec: codecWith(recognize)
});

/** 默认单元落在 `app.Secret` 上，`secret` 是加密列。 */
function createUnit(overrides: Partial<CommitChangeUnit> = {}): CommitChangeUnit {
  const { fingerprint, ...rest } = overrides;
  const base: Omit<CommitChangeUnit, 'fingerprint'> = {
    unitId: 'unit-1',
    transactionId: null,
    namespace: 'app',
    entity: 'Secret',
    entityId: 'secret-1',
    operation: 'update',
    patch: { secret: ENVELOPE },
    inversePatch: null,
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
    message: 'first',
    author: 'jimmy',
    operationId: CALLER_OPERATION_ID,
    units: [createUnit()],
    ...overrides
  };
}

function seedRef(probe: ReturnType<typeof createCommitGraphProbe>, entityManager: EntityManager): void {
  const ref = entityManager.instantiate(CommitBranchRef);
  ref.id = 'main';
  ref.branchId = 'main';
  ref.generation = 1;
  ref.headCommitId = null;
  ref.headRevision = 0;
  ref.status = 'ok';
  ref.corruptedAt = null;
  probe.seed(CommitBranchRef, [ref]);
}

describe('at-rest 断言接在写路径上（FR-038 / #6）', () => {
  it('明文落进加密列时 writeCommit 抛错，而不是照常提交', async () => {
    const entityManager = createEntityManager();
    const probe = createCommitGraphProbe({ rowsAffected: 1 });
    seedRef(probe, entityManager);
    const input = createWriteInput({ units: [createUnit({ patch: { secret: SENTINEL } })] });

    await expect(writeCommit(probe.executor, contextWith(entityManager, isEnvelopeLike), input)).rejects.toThrow(
      CommitEncryptedAtRestError
    );
  });

  it('抛出时一次读都没发过 —— 断言排在两次指纹计算之前', async () => {
    const entityManager = createEntityManager();
    const probe = createCommitGraphProbe({ rowsAffected: 1 });
    seedRef(probe, entityManager);
    const input = createWriteInput({ units: [createUnit({ inversePatch: { note: SENTINEL } })] });

    await expect(writeCommit(probe.executor, contextWith(entityManager, isEnvelopeLike), input)).rejects.toThrow(
      CommitEncryptedAtRestError
    );

    // 读 ref 是写路径的第一步，幂等查重的指纹与 buildCommitRows 的指纹都排在它之后。
    // 一次读都没发 ⇒ 断言比两者都早。把断言挪到 buildCommitRows 之后不会让别的断言变红，
    // 只会让这一条变红。
    expect(probe.finds).toEqual([]);
    expect(probe.statements).toEqual([]);
    expect(probe.saved).toEqual([]);
  });

  it('幂等重放路径也过断言 —— 不会靠重放把明文指纹写进去', async () => {
    const entityManager = createEntityManager();
    const probe = createCommitGraphProbe({ rowsAffected: 1 });
    seedRef(probe, entityManager);
    const input = createWriteInput({ units: [createUnit({ patch: { secret: SENTINEL } })] });
    const { commit } = buildCommitRows(entityManager, {
      id: 'commit-existing',
      kind: input.kind,
      parentIds: [],
      message: input.message,
      author: input.author,
      operationId: deriveCommitOperationId({
        branchGeneration: input.branchGeneration,
        operationId: input.operationId
      }),
      units: input.units
    });
    probe.seed(Commit, [commit]);

    // 断言若排在幂等查重之后，这一次会安静地返回 `reused` —— 一条明文提交被「复用」掉。
    await expect(writeCommit(probe.executor, contextWith(entityManager, isEnvelopeLike), input)).rejects.toThrow(
      CommitEncryptedAtRestError
    );
  });

  it('没有判定器却有加密列要判时 fail-closed，成因是 missing_recognizer', async () => {
    const entityManager = createEntityManager();
    const probe = createCommitGraphProbe({ rowsAffected: 1 });
    seedRef(probe, entityManager);

    // 「适配器没实现槽位 ⇒ 上下文里没有判定器 ⇒ 跳过检查」是这条线最自然的退化形态，
    // 而它的现象是全绿。
    const error = await writeCommit(probe.executor, contextWith(entityManager), createWriteInput()).catch(
      (thrown: unknown) => thrown
    );

    expect(error).toBeInstanceOf(CommitEncryptedAtRestError);
    expect((error as CommitEncryptedAtRestError).reason).toBe('missing_recognizer');
  });

  it('加密列已是信封形态时照常提交', async () => {
    const entityManager = createEntityManager();
    const probe = createCommitGraphProbe({ rowsAffected: 1 });
    seedRef(probe, entityManager);

    const outcome = await writeCommit(probe.executor, contextWith(entityManager, isEnvelopeLike), createWriteInput());

    expect(outcome.status).toBe('committed');
  });

  it('实体一个加密列都没有时不需要判定器', async () => {
    const entityManager = createEntityManager();
    const probe = createCommitGraphProbe({ rowsAffected: 1 });
    seedRef(probe, entityManager);
    const units = [createUnit({ entity: 'Plain', entityId: 'plain-1', patch: { title: SENTINEL } })];

    const outcome = await writeCommit(probe.executor, contextWith(entityManager), createWriteInput({ units }));

    // 非加密列里的明文本来就该是明文；把它们也拖进判定，调用方就得为了过检查去加密
    // 不需要加密的列。
    expect(outcome.status).toBe('committed');
  });
});

describe('createCommitWriteContext 把适配器槽位接到 codec 上', () => {
  /**
   * 建一个 `init()` 过的库，并造一个挂在它上面的假适配器。
   *
   * @remarks
   * 不从 `database.adapter()` 的工厂里取：那个工厂要等 `connect()` 才跑，而本组用例不连接
   * （连接会把假适配器拖进整条引导链路，与这里要验的一句转发无关）。直接 `new` 一个同库的
   * 实例即可——{@link createCommitWriteContext} 读的全部就是 `adapter.rxdb`。
   */
  const createAdapter = (): MockLocalAdapter => {
    const database = new RxDB({
      dbName: `rxdb-commit-ctx-${Math.random().toString(36).slice(2)}`,
      entities: [],
      sync: { local: { adapter: 'local' }, type: SyncType.None }
    });
    database.adapter('local', db => createMockAdapter(db));
    database.use(rxDBPluginWorkingTree);
    database.init();
    return createMockAdapter(database);
  };

  it('实体元数据解析走 schemaManager，两个解析器指向同一份', () => {
    const adapter = createAdapter();
    const metadata = { namespace: 'app', name: 'Secret' } as unknown as EntityMetadata;
    const getEntityMetadata = vi.spyOn(adapter.rxdb.schemaManager, 'getEntityMetadata').mockReturnValue(metadata);

    const context = createCommitWriteContext(adapter);

    expect(context.codec.resolveTargetMetadata('Secret', 'app')).toBe(metadata);
    expect(context.codec.resolveEntityMetadata?.('Secret', 'app')).toBe(metadata);
    // 命名空间不能丢：按裸名解析会让 `app.Note` 与 `rxdb.Note` 共用一份加密列清单。
    expect(getEntityMetadata.mock.calls).toEqual([
      ['Secret', 'app'],
      ['Secret', 'app']
    ]);
  });

  it('适配器没实现槽位时上下文里就没有判定器 —— 不补恒真兜底', () => {
    const adapter = createAdapter();

    expect(adapter.isEncryptedAtRest).toBeUndefined();
    expect(createCommitWriteContext(adapter).codec.isEncryptedAtRest).toBeUndefined();
  });

  it('适配器实现了槽位时转发过去，且 this 仍指向适配器', () => {
    const adapter = createAdapter();
    const seen: unknown[] = [];
    // 真实实现（`RxDBAdapterPGlite` / `RxDBAdapterSqliteBase`）是普通实例方法：
    // 摘下来直接当函数传会丢掉接收者，而那种写法在这三条断言之外一条都不会红。
    adapter.isEncryptedAtRest = function isEncryptedAtRest(this: MockLocalAdapter, value: unknown): boolean {
      seen.push([value, this === adapter]);
      return isEnvelopeLike(value);
    };

    const { isEncryptedAtRest } = createCommitWriteContext(adapter).codec;

    expect(isEncryptedAtRest?.(ENVELOPE)).toBe(true);
    expect(isEncryptedAtRest?.(SENTINEL)).toBe(false);
    expect(seen).toEqual([
      [ENVELOPE, true],
      [SENTINEL, true]
    ]);
  });

  it('entityManager 取自适配器所属的那个库', () => {
    const adapter = createAdapter();

    // 多个库共用同一批实体类时，拿错 entityManager 的 `instantiate()` 会把行造进另一个库。
    expect(createCommitWriteContext(adapter).entityManager).toBe(adapter.rxdb.entityManager);
  });
});
