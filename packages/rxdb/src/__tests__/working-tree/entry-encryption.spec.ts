/**
 * @fileoverview T054 红测试：工作树条目的加密 at-rest 契约（FR-045、SC-011）。
 *
 * @remarks
 * FR-045 是三句话：`WorkingTreeEntry` **延续**字段加密 at-rest 契约、
 * **解锁后读取可返回明文业务值**、**持久化 dump / 错误 / 摘要不得出现明文**。
 * commit 那一侧的同形契约（FR-038）由 `__tests__/commit/commit-encryption.spec.ts`
 * 钉死；本文件守的是**写入工作树**这一段——它比 commit 那段更危险，因为它跑在每一次
 * `save()` 上，而 commit 一天可能只发生几次。
 *
 * 三段前置责任已各有归属，这里不重复：
 *
 * - **codec 层「加密列原样穿过」**：`working-tree-patch-codec.spec.ts`（T020）。
 * - **`log: false`（条目不进变更日志）**：`__tests__/system/working-tree-system-entities.spec.ts`。
 * - **磁盘上真的没有明文**：`workingTreeCaptureConformanceSuite` 在六个后端上用
 *   `@aiao/rxdb-adapter-encrypted` 的 `scanForPlaintext()` 做（T067/T068）。单元测试跑不出真
 *   加密后端，本文件因此不假装能证明那一条。
 *
 * 它能证明的是**库自己不是泄漏源**，具体是这四处，每一处都是「写错了也全程不报错」的形态：
 *
 * 1. **指纹会长成序列化。** `fingerprintOf()` 写成 `canonicalize(patch)` 直接返回，
 *    `entry-fold.spec.ts` 与 `capture-entry-identity.spec.ts` 的全部指纹断言照常绿——
 *    相同内容同指纹、任一处变化即变化，两条性质序列化都满足。代价是 `fingerprint` 这一**非加密**
 *    列里躺着每个加密字段的明文，而它会进 `status()` 摘要、进错误、进跨 realm 诊断导出。
 * 2. **密文会被 JSON 化。** 折叠的 `{ ...existing.patch, ...write.patch }` 保住了引用，但写入端
 *    任何一处「深拷贝」——尤其是 `JSON.parse(JSON.stringify(patch))`——会把一段 `Uint8Array`
 *    变成 `{"0":222,"1":173,…}`。没有任何一步会抛：写得进 json 列、读得回来，只是解密时拿到的
 *    不再是那段字节，discard 一条旧值时字段直接解不开。
 * 3. **写入路径会再编解码一次。** 「`encrypted: true` 跳过」只在 codec 里成立；捕获路径若自己
 *    再 encode 一遍，加密包会被二次包裹，而二次包裹同样不报错。
 * 4. **错误会带上入参。** 捕获路径上有四个抛点（token 过期、目标实体未注册、折叠要删的行不在、
 *    状态行缺失），每一个都在手边握着整份 patch。往 message 里塞一句 `${JSON.stringify(patch)}`
 *    是最顺手的调试手段，代价是每一次失败的 `save()` 都把本该只以密文存在的列写进日志。
 *
 * 哨兵测试最容易骗自己的地方是**空跑也绿**：哨兵压根没进库，当然扫不到。所以每组都配一条反向
 * 对照——先证明哨兵确实落进了条目行，再证明它没出现在别处。
 */

import { describe, expect, it } from 'vitest';
import { ACTIVE_BRANCH_KEY } from '../../commit/active-branch-guard.js';
import type { EntityManager } from '../../entity/entity-manager.js';
import { PropertyType, SyncType } from '../../entity/metadata-options.interface.js';
import type { EntityMetadata } from '../../entity/metadata.interface.js';
import { getEntityMetadata } from '../../rxdb-utils.js';
import { RxDB } from '../../RxDB.js';
import { RxDBBranch } from '../../system/branch.js';
import { RXDB_CHANGE_VALUE_ENVELOPE_KEY } from '../../system/change-codec.js';
import { createWorkingTreeCapturePort, fingerprintOf } from '../../working-tree/capture-runtime.js';
import {
  WORKING_TREE_ACTIVATION_STATE_ID,
  WorkingTreeActivationState
} from '../../working-tree/working-tree-activation-state.entity.js';
import { WorkingTreeEntry } from '../../working-tree/working-tree-entry.entity.js';
import {
  decodeWorkingTreePatch,
  encodeWorkingTreePatch,
  UnknownWorkingTreePatchEntityError,
  type WorkingTreePatchCodecContext
} from '../../working-tree/working-tree-patch-codec.js';
import { WorkingTreeState } from '../../working-tree/working-tree-state.entity.js';
import {
  captureCrudWrite,
  foldWorkingTreeEntry,
  type ActiveBranchToken,
  type CapturedWrite,
  type WorkingTreeCapturePort,
  type WorkingTreeEntryRow
} from '../../working-tree/write-entry.js';
import { createCommitGraphProbe, type CommitGraphProbe } from '../commit/fixtures/commit-graph-probe.js';
import { createMockAdapter } from '../fixtures/test-db-setup.js';

/** 只应存在于**加密前**那个值里的串。它出现在任何别的地方都是泄漏。 */
const SENTINEL = 'PLAINTEXT-SENTINEL-wt-7b3e1d';

/** 一段假装是 AES-GCM 输出的密文——重点是它是 `Uint8Array`，不是可读字符串。 */
const CIPHERTEXT = Uint8Array.of(0xde, 0xad, 0xbe, 0xef, 0x00, 0x01, 0x7f, 0xff);

const BRANCH_ID = 'branch-main';

const ACTIVATION_REVISION = 3;

const TOKEN: ActiveBranchToken = { branchId: BRANCH_ID, activationRevision: ACTIVATION_REVISION };

const KEY = { namespace: 'app', entity: 'Secret', entityId: 'secret-1' } as const;

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
 * 跨后端的权威扫描器是 `@aiao/rxdb-adapter-encrypted` 的 `scanForPlaintext()`，但
 * `packages/rxdb` 不能依赖适配器（依赖方向反了），所以这里只做最朴素的一件事：把每个值变成人能
 * 读的文本再搜。`Uint8Array` 按 UTF-8 宽松解码——密文解出来是乱码，而**明文**解出来就是明文，
 * 这正是要抓的那一种。
 */
const dumpOf = (rows: readonly unknown[]): string =>
  JSON.stringify(rows, (_key, value: unknown) => {
    if (value instanceof Uint8Array) return new TextDecoder('utf-8', { fatal: false }).decode(value);
    if (typeof value === 'bigint') return value.toString();
    return value;
  });

/**
 * 错误对象上人能看到的一切：message、可枚举自有属性、默认 `toString()`。
 *
 * @remarks
 * 只取 `message` 的话，把 patch 挂成 `error.context` 的实现会整个漏过去——而那恰恰是
 * 结构化日志最爱序列化的那一半。非对象（含"根本没抛"）原样转成文本，这样"没抛"这件事
 * 在断言里读起来仍是一句话，而不是一个 `TypeError`。
 */
const errorSurfaceOf = (error: unknown): string => {
  const own =
    typeof error === 'object' && error !== null ? JSON.stringify(error, Object.getOwnPropertyNames(error)) : '';
  return [error instanceof Error ? error.message : '', String(error), own ?? ''].join('\n');
};

function createEntityManager(): EntityManager {
  const database = new RxDB({
    dbName: `rxdb-entry-encryption-${Math.random().toString(36).slice(2)}`,
    entities: [],
    sync: { local: { adapter: 'local' }, type: SyncType.None }
  });
  database.adapter('local', db => createMockAdapter(db));
  database.init();
  return database.entityManager;
}

const entityManager = createEntityManager();

interface Scene {
  readonly probe: CommitGraphProbe;
  /** 走完整捕获路径落一次写；`token` 不传即用与库里一致的那个 */
  capture(write: CapturedWrite, token?: ActiveBranchToken): Promise<void>;
  /** 单独取一个绑到本布景的端口，用来构造 `captureCrudWrite` 够不到的那几个抛点 */
  port(write: Pick<CapturedWrite, 'operation' | 'patch' | 'inversePatch'>): WorkingTreeCapturePort;
  /** 库里当前的条目行 */
  entries(): WorkingTreeEntry[];
}

/**
 * 造一套「分支已激活、工作树为空」的布景
 *
 * @param options.withState - 是否建 `WorkingTreeState` 行；`false` 用来逼出状态行缺失那个抛点
 */
function scene(options: { readonly withState?: boolean } = {}): Scene {
  const probe = createCommitGraphProbe();
  probe.seed(RxDBBranch, [
    { id: BRANCH_ID, local: true, remote: false, activated: true, activeKey: ACTIVE_BRANCH_KEY }
  ]);
  probe.seed(WorkingTreeActivationState, [
    { id: WORKING_TREE_ACTIVATION_STATE_ID, activationRevision: ACTIVATION_REVISION, branchGenerationSeq: 1 }
  ]);
  if (options.withState !== false) {
    probe.seed(WorkingTreeState, [
      {
        id: BRANCH_ID,
        branchId: BRANCH_ID,
        baseHeadCommitId: null,
        workingTreeRevision: 0,
        entryCount: 0,
        updatedAt: new Date()
      }
    ]);
  }

  const portFor = (token: ActiveBranchToken): WorkingTreeCapturePort =>
    createWorkingTreeCapturePort(probe.executor, { entityManager }, token, KEY);

  return {
    probe,
    port: () => portFor(TOKEN),
    async capture(write, token = TOKEN) {
      const port = createWorkingTreeCapturePort(probe.executor, { entityManager }, token, {
        namespace: write.namespace,
        entity: write.entity,
        entityId: write.entityId
      });
      await captureCrudWrite(port, token, write, async () => undefined);
    },
    entries() {
      return probe.rowsOf(WorkingTreeEntry) as WorkingTreeEntry[];
    }
  };
}

/** 走真实捕获口径把 patch 编好——加密列会被 codec 跳过，留下裸 `Uint8Array`。 */
const encodedPatch = (extra: Readonly<Record<string, unknown>> = {}): Record<string, unknown> =>
  encodeWorkingTreePatch(codecContext, KEY, {
    title: 'after',
    blob: Uint8Array.of(1, 2, 3),
    secret: CIPHERTEXT,
    ...extra
  })!;

const captured = (init: Partial<CapturedWrite> = {}): CapturedWrite => {
  const patch = init.patch === undefined ? { title: SENTINEL } : init.patch;
  return {
    ...KEY,
    operation: 'update',
    patch,
    inversePatch: { title: 'HEAD 里的标题' },
    fingerprint: fingerprintOf('update', patch as Record<string, unknown> | null),
    origin: 'local',
    unitId: 'unit-1',
    transactionId: 'tx-1',
    sourceChangeId: null,
    ...init
  };
};

const row = (init: Partial<WorkingTreeEntryRow> = {}): WorkingTreeEntryRow => ({
  ...KEY,
  operation: 'update',
  patch: { title: 'first' },
  inversePatch: { title: 'HEAD 里的标题' },
  fingerprint: 'fp-existing',
  origin: 'local',
  unitId: 'unit-0',
  transactionId: 'tx-0',
  sourceChangeId: null,
  ...init
});

describe('摘要层不承载任何字段值（FR-045）', () => {
  it('哨兵确实落进了条目行——本组其余断言不是空跑', async () => {
    const stage = scene();

    await stage.capture(captured());

    // 没有这条对照，「指纹里搜不到哨兵」可以因为哨兵根本没进库而绿。
    expect(dumpOf(stage.entries())).toContain(SENTINEL);
  });

  it('落库后的 fingerprint 列里搜不到 patch 的任何内容', async () => {
    const stage = scene();

    await stage.capture(captured());

    expect(stage.entries()[0]!.fingerprint).not.toContain(SENTINEL);
  });

  it('fingerprintOf 是摘要不是序列化：体量差两个数量级，长度不变', () => {
    const small = fingerprintOf('update', { title: SENTINEL });
    const large = fingerprintOf(
      'update',
      Object.fromEntries(Array.from({ length: 200 }, (_, index) => [`field${index}`, `${SENTINEL}-${index}`]))
    );

    // 长度随输入增长 = 它在搬运内容，而不是在摘要内容。
    expect(large).toHaveLength(small.length);
    expect(large).not.toContain(SENTINEL);
    expect(small).not.toContain(SENTINEL);
  });

  it('指纹不回显内容，但仍要区分内容', () => {
    const withSentinel = fingerprintOf('update', { title: SENTINEL });
    const withoutSentinel = fingerprintOf('update', { title: 'other' });

    // 只钉「不回显」的话，`return 'x'` 就能过。摘要必须同时还是个有分辨力的摘要。
    expect(withSentinel).not.toBe(withoutSentinel);
  });

  it('指纹也不回显密文——密文一样不该进非加密列', () => {
    const fingerprint = fingerprintOf('update', { secret: CIPHERTEXT });

    // 一段 Uint8Array 变成文本只有两条路：`String(bytes)` 给 `222,173,…`，
    // `JSON.stringify(bytes)` 给 `{"0":222,…}`。两条都堵上。
    expect(fingerprint).not.toContain(String(CIPHERTEXT));
    expect(fingerprint).not.toMatch(/"?0"?\s*:\s*222/);
  });

  it('条目的列集合就是持久化面，没有第二处放内容的地方', () => {
    const metadata = getEntityMetadata(WorkingTreeEntry);

    // 将来加一列 `patchPreview` / `summary` / `plaintextTitle` 之类会立刻红在这里。
    expect(metadata.properties.map(property => property.name).sort()).toEqual(
      [
        'createdAt',
        'entity',
        'entityId',
        'fingerprint',
        'id',
        'inversePatch',
        'namespace',
        'operation',
        'origin',
        'patch',
        'sourceChangeId',
        'transactionId',
        'unitId',
        'updatedAt'
      ].sort()
    );
    expect(metadata.relations.map(relation => relation.name)).toEqual(['branch']);
  });
});

describe('密文原样落条目，不解包也不二次编码（FR-045）', () => {
  const storedPatchOf = (stage: Scene): Record<string, unknown> => stage.entries()[0]!.patch as Record<string, unknown>;

  it('密文仍是 Uint8Array，没有被 JSON 化成 {"0":…}', async () => {
    const stage = scene();
    const patch = encodedPatch();

    await stage.capture(captured({ patch, inversePatch: patch }));

    const secret = storedPatchOf(stage)['secret'];
    expect(secret).toBeInstanceOf(Uint8Array);
    expect(secret).toEqual(CIPHERTEXT);
  });

  it('加密列没有被套上 change-codec 的信封', async () => {
    const stage = scene();
    const patch = encodedPatch();

    await stage.capture(captured({ patch, inversePatch: patch }));

    const secret = storedPatchOf(stage)['secret'];
    expect(typeof secret === 'object' && secret !== null && RXDB_CHANGE_VALUE_ENVELOPE_KEY in secret).toBe(false);
  });

  it('非加密的 binary 列保持捕获时的信封形态，捕获不再解一遍', async () => {
    const stage = scene();
    const patch = encodedPatch();

    await stage.capture(captured({ patch, inversePatch: patch }));

    // 写入方若自己 decode 一次再 encode 回去，这里仍然相等——所以同时比 `blob` 与 `secret`：
    // 解一遍再编回去会把 `secret` 当成普通 binary 列处理，那一条会先红。
    expect(storedPatchOf(stage)['blob']).toEqual(patch['blob']);
    expect(storedPatchOf(stage)['secret']).toEqual(patch['secret']);
  });

  it('inversePatch 与 patch 同等对待', async () => {
    const stage = scene();
    const patch = encodedPatch();

    await stage.capture(captured({ patch, inversePatch: patch }));

    const inverse = stage.entries()[0]!.inversePatch as Record<string, unknown>;
    expect(inverse['secret']).toBeInstanceOf(Uint8Array);
    expect(inverse['secret']).toEqual(CIPHERTEXT);
  });

  it('折进已有条目之后密文仍是密文——第二次写走的是 update 分支', async () => {
    const stage = scene();
    const patch = encodedPatch();

    await stage.capture(captured({ patch: { title: 'first' }, inversePatch: { title: 'HEAD' } }));
    await stage.capture(captured({ patch, inversePatch: patch, unitId: 'unit-2' }));

    // 折叠合成用的是对象展开，引用本该原样带过去；换成任何一种 JSON 深拷贝这里就红。
    expect(stage.entries()).toHaveLength(1);
    expect(storedPatchOf(stage)['secret']).toBeInstanceOf(Uint8Array);
    expect(storedPatchOf(stage)['secret']).toEqual(CIPHERTEXT);
  });

  it('折叠是纯函数层，密文引用逐字节穿过合成', () => {
    const outcome = foldWorkingTreeEntry(row(), captured({ patch: { secret: CIPHERTEXT } }));

    expect(outcome.kind).toBe('update');
    if (outcome.kind === 'remove') throw new Error('unreachable');
    // 引用相同是比 `toEqual` 更强的断言：`{"0":222,…}` 与一段 Uint8Array 在 toEqual 下也不相等，
    // 但 `new Uint8Array(bytes)` 这种"无害"的拷贝能骗过 toEqual，骗不过 toBe。
    expect((outcome.entry.patch as Record<string, unknown>)['secret']).toBe(CIPHERTEXT);
  });

  it('落库的密文与入参共享的是值不是可变引用的风险由 codec 承担，捕获不再拷一次', async () => {
    const stage = scene();
    const mutable = CIPHERTEXT.slice();
    const patch = encodeWorkingTreePatch(codecContext, KEY, { secret: mutable })!;

    await stage.capture(captured({ patch, inversePatch: patch }));

    // 条目是**可变**的一面（提交前随时会被折叠改写），与 `CommitChangeSet` 的不可变副本不同：
    // 这里不要求深拷贝，只要求"字节没被改形"。要求深拷贝的话每次 save() 都要复制整份 patch。
    expect(storedPatchOf(stage)['secret']).toBe(patch['secret']);
  });
});

describe('错误不含字段值（FR-045）', () => {
  it('token 过期被拒时，错误里没有 patch 内容', async () => {
    const stage = scene();
    const patch = encodedPatch({ title: SENTINEL });

    const error = await stage
      .capture(captured({ patch, inversePatch: patch }), { branchId: BRANCH_ID, activationRevision: 1 })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect(errorSurfaceOf(error)).not.toContain(SENTINEL);
    expect(errorSurfaceOf(error)).not.toContain(String(CIPHERTEXT));
    expect(errorSurfaceOf(error)).not.toMatch(/"?0"?\s*:\s*222/);
  });

  it('工作树状态行缺失时，错误里没有 patch 内容', async () => {
    const stage = scene({ withState: false });
    const patch = encodedPatch({ title: SENTINEL });

    const error = await stage.capture(captured({ patch, inversePatch: patch })).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect(errorSurfaceOf(error)).not.toContain(SENTINEL);
  });

  it('折叠判定要删的行不在库里时，错误里只有身份没有内容', async () => {
    const stage = scene();
    const patch = encodedPatch({ title: SENTINEL });

    // `readEntry` 报「有一条 insert 条目」而库里其实没有——折叠于是判 `remove`，
    // 而 `persistEntry` 自己再查一次查不到，落到那个抛点上。这是这条路上唯一一个
    // 「`row` 是 undefined、patch 却仍在 `captureCrudWrite` 手里」的抛点。
    const port = stage.port({ operation: 'delete', patch: null, inversePatch: patch });
    const detached: WorkingTreeCapturePort = { ...port, readEntry: async () => row({ operation: 'insert' }) };

    const error = await captureCrudWrite(
      detached,
      TOKEN,
      captured({ operation: 'delete', patch: null, inversePatch: patch }),
      async () => undefined
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect(errorSurfaceOf(error)).toContain(`${KEY.namespace}.${KEY.entity}#${KEY.entityId}`);
    expect(errorSurfaceOf(error)).not.toContain(SENTINEL);
  });

  it('目标实体未注册时，编码端的错误只点实体名', () => {
    const error = (() => {
      try {
        encodeWorkingTreePatch(codecContext, { namespace: 'app', entity: 'Ghost' }, { title: SENTINEL });
        return undefined;
      } catch (caught: unknown) {
        return caught;
      }
    })();

    expect(error).toBeInstanceOf(UnknownWorkingTreePatchEntityError);
    expect(errorSurfaceOf(error)).toContain('app.Ghost');
    expect(errorSurfaceOf(error)).not.toContain(SENTINEL);
  });
});

describe('解锁后读取仍能拿回业务值（FR-045）', () => {
  it('往返一圈之后加密列逐字节不变——库不挡在解密前面', async () => {
    const stage = scene();
    const patch = encodedPatch();

    await stage.capture(captured({ patch, inversePatch: patch }));
    const decoded = decodeWorkingTreePatch(codecContext, KEY, stage.entries()[0]!.patch)!;

    // 解密本身是后端的事（codec 对 `encrypted: true` 整列跳过）。库这一层要保证的是：
    // 交给后端解密的那段字节，与捕获时拿到的那段**逐字节相同**。
    expect(decoded['secret']).toEqual(CIPHERTEXT);
  });

  it('往返一圈之后非加密列还原成明文业务值', async () => {
    const stage = scene();
    const patch = encodedPatch();

    await stage.capture(captured({ patch, inversePatch: patch }));
    const decoded = decodeWorkingTreePatch(codecContext, KEY, stage.entries()[0]!.patch)!;

    expect(decoded['title']).toBe('after');
    expect(decoded['blob']).toEqual(Uint8Array.of(1, 2, 3));
  });
});
