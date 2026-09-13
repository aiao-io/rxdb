/**
 * @fileoverview T029 红测试：commit 路径的加密 at-rest 契约（FR-038、SC-011）。
 *
 * @remarks
 * FR-038 有三句话：**持久化路径不得先解密再把明文写入新系统表**、
 * **摘要不得包含加密字段值**、**日志与错误不得包含加密字段值**。
 * 这份文件钉前两句和「错误」那半句；「日志」那半句由新系统表的 `log: false`
 * 承担，已由 `__tests__/system/working-tree-system-entities.spec.ts` 钉死，
 * 这里不重复一遍。codec 层的「加密列原样穿过」也已由
 * `__tests__/working-tree/working-tree-patch-codec.spec.ts`（T020）钉死；
 * 本文件守的是**它之后**那一段——commit 写入路径拿到已编码的 patch 之后还会不会再动它。
 *
 * 单元测试跑不出真加密后端，所以这里刻意不假装能证明「磁盘上没有明文」——
 * 那是 `workingTreeCommitConformanceSuite` 在六个后端上用
 * `@aiao/rxdb-adapter-encrypted` 的 `scanForPlaintext()` 做的（T042/T043）。
 * 本文件能证明的是**库自己不是泄漏源**，具体是这四处：
 *
 * 1. **摘要会长成序列化**。`contentFingerprint` 只要写成 `JSON.stringify(input)`
 *    就能通过 commit-graph.spec 的全部指纹断言（相同内容同指纹、任一处变化即变化），
 *    而它会把每个字段的值原样搬进 `rxdb_commit` 的一列——那一列进日志、进错误上报、
 *    进跨 realm 的诊断导出。摘要必须是摘要。
 * 2. **密文会被 JSON 化。**`structuredClone` 之外的任何「深拷贝」写法——尤其是
 *    `JSON.parse(JSON.stringify(patch))`——会把一段 `Uint8Array` 密文变成
 *    `{"0":222,"1":173,…}`。没有任何一步会抛：写得进 json 列，读得回来，
 *    只是解密时拿到的不再是那段字节，恢复一条旧版本时字段直接解不开。
 * 3. **写入路径会再编解码一次**。`change-codec` 的「`encrypted: true` 跳过」只在
 *    codec 里成立；commit 写入方若自己再 encode 一遍，加密包会被二次包裹，
 *    而二次包裹同样不报错。
 * 4. **错误会带上入参**。`CommitValidationError` 的 message 里塞一句
 *    `${JSON.stringify(input)}` 是最顺手的调试手段，代价是每一次被拒的提交
 *    都把整批 patch 写进日志——包括那些本该只以密文存在的列。
 *
 * 哨兵测试最容易骗自己的地方是**空跑也绿**：哨兵压根没进库，当然扫不到。
 * 所以每组断言都配一条反向对照——先证明哨兵确实落进了 ChangeSet，再证明它没出现在别处。
 */

import { describe, expect, it } from 'vitest';
import type { CommitChangeUnit } from '../../commit/change-unit.js';
import { computeChangeUnitFingerprint, computeCommitContentFingerprint } from '../../commit/change-unit.js';
import { CommitBranchRef } from '../../commit/commit-branch-ref.entity.js';
import { CommitChangeSet } from '../../commit/commit-change-set.entity.js';
import { Commit } from '../../commit/commit.entity.js';
import type { WriteCommitInput } from '../../commit/write-commit.js';
import { writeCommit } from '../../commit/write-commit.js';
import type { EntityManager } from '../../entity/entity-manager.js';
import { PropertyType, SyncType } from '../../entity/metadata-options.interface.js';
import type { EntityMetadata } from '../../entity/metadata.interface.js';
import { getEntityMetadata } from '../../rxdb-utils.js';
import { RxDB } from '../../RxDB.js';
import { RXDB_CHANGE_VALUE_ENVELOPE_KEY } from '../../system/change-codec.js';
import type { WorkingTreePatchCodecContext } from '../../working-tree/working-tree-patch-codec.js';
import { encodeWorkingTreePatch } from '../../working-tree/working-tree-patch-codec.js';
import { createMockAdapter } from '../fixtures/test-db-setup.js';
import { createCommitGraphProbe } from './fixtures/commit-graph-probe.js';

/** 只应存在于**加密前**那个值里的串。它出现在任何别的地方都是泄漏。 */
const SENTINEL = 'PLAINTEXT-SENTINEL-4f2c9a';

const CALLER_OPERATION_ID = '00000000-0000-4000-8000-0000000000e1';

/** 一段假装是 AES-GCM 输出的密文——重点是它是 `Uint8Array`，不是可读字符串。 */
const CIPHERTEXT = Uint8Array.of(0xde, 0xad, 0xbe, 0xef, 0x00, 0x01, 0x7f, 0xff);

/** 带一个加密列、一个二进制列、一个普通列的目标实体。 */
const secretMetadata = {
  namespace: 'app',
  name: 'Secret',
  propertyMap: new Map([
    ['id', { name: 'id', columnName: 'id', type: PropertyType.string, primary: true }],
    ['title', { name: 'title', columnName: 'title', type: PropertyType.string }],
    ['blob', { name: 'blob', columnName: 'blob', type: PropertyType.binary }],
    ['secret', { name: 'secret', columnName: 'secret', type: PropertyType.binary, encrypted: true }]
  ])
} as unknown as EntityMetadata;

const codecContext: WorkingTreePatchCodecContext = {
  resolveTargetMetadata: (entity, namespace) =>
    entity === 'Secret' && namespace === 'app' ? secretMetadata : undefined
};

/**
 * 把一批行摊成一个字符串，供子串搜索。
 *
 * @remarks
 * 跨后端的权威扫描器是 `@aiao/rxdb-adapter-encrypted` 的 `scanForPlaintext()`，
 * 但 `packages/rxdb` 不能依赖适配器（依赖方向反了），所以这里只做最朴素的一件事：
 * 把每个值变成人能读的文本再搜。`Uint8Array` 按 UTF-8 宽松解码——密文解出来是乱码，
 * 而**明文**解出来就是明文，这正是要抓的那一种。
 */
const dumpOf = (rows: readonly unknown[]): string =>
  JSON.stringify(rows, (_key, value: unknown) => {
    if (value instanceof Uint8Array) return new TextDecoder('utf-8', { fatal: false }).decode(value);
    if (typeof value === 'bigint') return value.toString();
    return value;
  });

function createEntityManager(): EntityManager {
  const database = new RxDB({
    dbName: `rxdb-commit-encryption-${Math.random().toString(36).slice(2)}`,
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
    entity: 'Secret',
    entityId: 'secret-1',
    operation: 'update',
    patch: { title: SENTINEL },
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
    message: 'first',
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

/** CAS 必然命中的布景——这样没写成的东西只可能是路径自己丢的。 */
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
  return { probe, entityManager };
}

async function commitOnce(scene: Scene, overrides: Partial<WriteCommitInput> = {}): Promise<void> {
  const outcome = await writeCommit(scene.probe.executor, scene.entityManager, createWriteInput(overrides));
  if (outcome.status !== 'committed') throw new Error(`expected committed, got ${outcome.status}`);
}

describe('摘要层不承载任何字段值（FR-038、FR-027）', () => {
  it('哨兵确实落进了 ChangeSet——本组其余断言不是空跑', async () => {
    const scene = createScene();

    await commitOnce(scene);

    // 没有这条对照，「Commit 行里搜不到哨兵」可以因为哨兵根本没进库而绿。
    expect(dumpOf(scene.probe.rowsOf(CommitChangeSet))).toContain(SENTINEL);
  });

  it('Commit 行里搜不到 patch 的任何内容', async () => {
    const scene = createScene();

    await commitOnce(scene);

    expect(dumpOf(scene.probe.rowsOf(Commit))).not.toContain(SENTINEL);
  });

  it('CAS 语句里也搜不到——ref 更新只带 revision，不带内容', async () => {
    const scene = createScene();

    await commitOnce(scene);

    expect(scene.probe.statements.join('\n')).not.toContain(SENTINEL);
  });

  it('contentFingerprint 是摘要不是序列化：体量差一个数量级，长度不变', () => {
    const small = computeCommitContentFingerprint({
      kind: 'normal',
      parentIds: [],
      message: 'm',
      author: 'jimmy',
      units: [createUnit()]
    });
    const large = computeCommitContentFingerprint({
      kind: 'normal',
      parentIds: [],
      message: 'm',
      author: 'jimmy',
      units: Array.from({ length: 200 }, (_, index) =>
        createUnit({ unitId: `unit-${index}`, entityId: `secret-${index}`, patch: { title: `${SENTINEL}-${index}` } })
      )
    });

    // 长度随输入增长 = 它在搬运内容，而不是在摘要内容。
    expect(large).toHaveLength(small.length);
    expect(large).not.toContain(SENTINEL);
    expect(small).not.toContain(SENTINEL);
  });

  it('单元指纹不回显内容，但仍要区分内容', () => {
    const withSentinel = createUnit({ patch: { title: SENTINEL }, inversePatch: { title: SENTINEL } });
    const withoutSentinel = createUnit({ patch: { title: 'other' }, inversePatch: { title: 'other' } });

    expect(withSentinel.fingerprint).not.toContain(SENTINEL);
    // 只钉「不回显」的话，`return 'x'` 就能过。摘要必须同时还是个有分辨力的摘要。
    expect(withSentinel.fingerprint).not.toBe(withoutSentinel.fingerprint);
  });

  it('Commit 的列集合就是 FR-027 的审计面，没有第二处放内容的地方', () => {
    const names = getEntityMetadata(Commit)
      .properties.map(property => property.name)
      .sort();

    // 将来加一列 `summaryPreview` / `patchDigest` 之类会立刻红在这里。
    expect(names).toEqual(
      [
        'author',
        'changeSetCount',
        'contentFingerprint',
        'createdAt',
        'firstParentId',
        'id',
        'kind',
        'message',
        'operationId',
        'parentIds'
      ].sort()
    );
  });
});

describe('密文原样落库，不解包也不二次编码（FR-038）', () => {
  /** 走真实捕获口径把 patch 编好——加密列会被 codec 跳过，留下裸 `Uint8Array`。 */
  const encodedPatch = (): Record<string, unknown> =>
    encodeWorkingTreePatch(
      codecContext,
      { namespace: 'app', entity: 'Secret' },
      {
        title: 'after',
        blob: Uint8Array.of(1, 2, 3),
        secret: CIPHERTEXT
      }
    )!;

  const storedPatchOf = (scene: Scene): Record<string, unknown> =>
    (scene.probe.rowsOf(CommitChangeSet)[0] as CommitChangeSet).patch as Record<string, unknown>;

  it('密文仍是 Uint8Array，没有被 JSON 化成 {"0":…}', async () => {
    const scene = createScene();
    const patch = encodedPatch();

    await commitOnce(scene, { units: [createUnit({ patch, inversePatch: patch })] });

    const secret = storedPatchOf(scene)['secret'];
    expect(secret).toBeInstanceOf(Uint8Array);
    expect(secret).toEqual(CIPHERTEXT);
  });

  it('密文是深拷贝，不与入参共享 buffer', async () => {
    const scene = createScene();
    const mutable = CIPHERTEXT.slice();
    const patch = encodeWorkingTreePatch(codecContext, { namespace: 'app', entity: 'Secret' }, { secret: mutable })!;

    await commitOnce(scene, { units: [createUnit({ patch, inversePatch: patch })] });
    mutable.fill(0);

    // data-model.md §2.4：ChangeSet 复制完整不可变恢复数据。共享 buffer 时
    // 提交后清理工作树条目会把**已经不可变的历史**一起改掉。
    expect(storedPatchOf(scene)['secret']).toEqual(CIPHERTEXT);
  });

  it('加密列没有被套上 change-codec 的信封', async () => {
    const scene = createScene();
    const patch = encodedPatch();

    await commitOnce(scene, { units: [createUnit({ patch, inversePatch: patch })] });

    const secret = storedPatchOf(scene)['secret'];
    expect(typeof secret === 'object' && secret !== null && RXDB_CHANGE_VALUE_ENVELOPE_KEY in secret).toBe(false);
  });

  it('非加密的 binary 列保持捕获时的信封形态，写入方不再解一遍', async () => {
    const scene = createScene();
    const patch = encodedPatch();

    await commitOnce(scene, { units: [createUnit({ patch, inversePatch: patch })] });

    // 写入方若自己 decode 一次再 encode 回去，这里仍然相等——所以同时比 `blob` 与 `secret`：
    // 解一遍再编回去会让 `secret` 被当成普通 binary 列处理，那一条会先红。
    expect(storedPatchOf(scene)['blob']).toEqual(patch['blob']);
    expect(storedPatchOf(scene)['secret']).toEqual(patch['secret']);
  });

  it('inversePatch 与 patch 同等对待', async () => {
    const scene = createScene();
    const patch = encodedPatch();

    await commitOnce(scene, { units: [createUnit({ patch, inversePatch: patch })] });

    const row = scene.probe.rowsOf(CommitChangeSet)[0] as CommitChangeSet;
    expect((row.inversePatch as Record<string, unknown>)['secret']).toBeInstanceOf(Uint8Array);
    expect((row.inversePatch as Record<string, unknown>)['secret']).toEqual(CIPHERTEXT);
  });
});

describe('错误不含字段值（FR-038）', () => {
  /** 错误对象上人能看到的一切：message、可枚举自有属性、默认 `toString()`。 */
  const errorSurfaceOf = (error: unknown): string =>
    [
      error instanceof Error ? error.message : '',
      String(error),
      JSON.stringify(error, Object.getOwnPropertyNames(error as object))
    ].join('\n');

  const rejections: readonly (readonly [string, Partial<WriteCommitInput>])[] = [
    ['empty_message', { message: '   ' }],
    ['missing_author', { author: null }],
    ['missing_operation_id', { operationId: '' }],
    ['empty_units', { units: [] }]
  ];

  for (const [label, overrides] of rejections) {
    it(`${label} 被拒时，错误里没有 patch 内容`, async () => {
      const scene = createScene();

      const error = await writeCommit(scene.probe.executor, scene.entityManager, createWriteInput(overrides)).catch(
        (caught: unknown) => caught
      );

      expect(error).toBeInstanceOf(Error);
      // `${JSON.stringify(input)}` 是最顺手的调试手段，也是把整批 patch 写进日志的那一行。
      expect(errorSurfaceOf(error)).not.toContain(SENTINEL);
    });
  }

  it('错误里也没有密文——密文一样不该进日志', async () => {
    const scene = createScene();
    const patch = encodeWorkingTreePatch(codecContext, { namespace: 'app', entity: 'Secret' }, { secret: CIPHERTEXT })!;

    const error = await writeCommit(
      scene.probe.executor,
      scene.entityManager,
      createWriteInput({ message: '  ', units: [createUnit({ patch, inversePatch: patch })] })
    ).catch((caught: unknown) => caught);

    // 一段 Uint8Array 变成文本只有两条路：`String(bytes)` 给 `222,173,…`，
    // `JSON.stringify(bytes)` 给 `{"0":222,…}`。两条都堵上。
    expect(errorSurfaceOf(error)).not.toContain(String(CIPHERTEXT));
    expect(errorSurfaceOf(error)).not.toMatch(/"0"\s*:\s*222/);
  });
});
