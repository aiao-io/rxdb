/**
 * 分支物化来源契约在核心侧的两件事：
 * 1. 来源槽位 `rxdb.branchMaterializationSource()`——一条连接至多一个、同一来源重复登记幂等、
 *    随作用域撤销时按身份守卫；
 * 2. 两端共用的规范化与分页指纹——键序无关、域分隔。
 *
 * 槽位的消费者（工作树接管流水线）与生产者（同步插件）各在自己的包里测；这里只守两者相遇的那一格。
 */
import { LifecycleScope, LifecycleScopeDisposedError } from '@aiao/utils';
import { afterEach, describe, expect, it } from 'vitest';
import { SyncType } from '../../entity/metadata-options.interface.js';
import { RxDB } from '../../RxDB.js';
import {
  type BranchMaterializationSource,
  branchMaterializationPageFingerprint,
  canonicalMaterializationJson
} from '../../sync-contract/branch-materialization-source.js';
import { sha256Hex } from '../../system/sha256.js';

const databases = new Set<RxDB>();
let sequence = 0;

/** 建一个不连接的实例：槽位是纯内存状态，与适配器无关。 */
function createDatabase(): RxDB {
  sequence += 1;
  const database = new RxDB({
    dbName: `branch-materialization-source-${sequence}`,
    entities: [],
    sync: { type: SyncType.None, local: { adapter: 'sqlite' } }
  });
  databases.add(database);
  return database;
}

/** 一个什么都不做的来源；这里只比身份。 */
function createSource(): BranchMaterializationSource {
  return {
    freezeIntent: () => Promise.resolve({ frozenRemoteWatermark: {}, syncScope: [] }),
    pages: async function* () {
      yield* [];
    },
    resolveIntentDrift: () => Promise.resolve(undefined),
    projectPage: () => Promise.resolve({ deletes: new Map(), updates: new Map(), inserts: new Map() }),
    settle: () => Promise.resolve()
  };
}

afterEach(async () => {
  const pending = Array.from(databases);
  databases.clear();
  await Promise.all(pending.map(database => database.disconnectAll()));
});

describe('RxDB.branchMaterializationSource 槽位', () => {
  it('没登记时取出 undefined——交给工作树去报 source_unavailable', () => {
    expect(createDatabase().getBranchMaterializationSource()).toBeUndefined();
  });

  it('登记后取出的是同一个对象，且返回 this 可链式调用', () => {
    const database = createDatabase();
    const source = createSource();

    expect(database.branchMaterializationSource(source)).toBe(database);
    expect(database.getBranchMaterializationSource()).toBe(source);
  });

  it('同一来源重复登记是幂等的', () => {
    const database = createDatabase();
    const source = createSource();

    database.branchMaterializationSource(source);
    expect(() => database.branchMaterializationSource(source)).not.toThrow();
    expect(database.getBranchMaterializationSource()).toBe(source);
  });

  it('一条连接至多一个：另一个来源登记时当场抛错，不静默顶掉前一个', () => {
    const database = createDatabase();
    const first = createSource();
    database.branchMaterializationSource(first);

    // 顶掉的话，同一条分支可以被两份互不相识的快照各物化一次
    expect(() => database.branchMaterializationSource(createSource())).toThrow(/至多一个/);
    expect(database.getBranchMaterializationSource()).toBe(first);
  });

  it('带作用域登记：作用域释放时撤销，之后可以登记另一个', async () => {
    const database = createDatabase();
    const scope = new LifecycleScope('sync');
    const first = createSource();

    database.branchMaterializationSource(first, scope);
    expect(database.getBranchMaterializationSource()).toBe(first);

    await scope.dispose();
    expect(database.getBranchMaterializationSource()).toBeUndefined();

    const second = createSource();
    database.branchMaterializationSource(second);
    expect(database.getBranchMaterializationSource()).toBe(second);
  });

  it('撤销按来源身份守卫：迟到的撤销不会清掉后来者', async () => {
    const database = createDatabase();
    const stale = createSource();
    const firstScope = new LifecycleScope('first');
    const lateScope = new LifecycleScope('late');

    // 同一来源在两个作用域上各登记一次（幂等），先释放的那个就清槽
    database.branchMaterializationSource(stale, firstScope);
    database.branchMaterializationSource(stale, lateScope);
    await firstScope.dispose();
    expect(database.getBranchMaterializationSource()).toBeUndefined();

    const current = createSource();
    database.branchMaterializationSource(current);
    await lateScope.dispose();

    // lateScope 手里那份撤销指向的是 stale；按槽位清的话，current 会被一个与它无关的作用域带走
    expect(database.getBranchMaterializationSource()).toBe(current);
  });

  it('作用域内登记被冲突拒掉时不落下撤销条目', async () => {
    const database = createDatabase();
    const current = createSource();
    database.branchMaterializationSource(current);
    const scope = new LifecycleScope('rejected');

    expect(() => database.branchMaterializationSource(createSource(), scope)).toThrow(/至多一个/);
    await scope.dispose();

    expect(database.getBranchMaterializationSource()).toBe(current);
  });

  it('传已释放的作用域时同步抛错且不落下登记', async () => {
    const database = createDatabase();
    const scope = new LifecycleScope('stale');
    await scope.dispose();

    // 静默登记会更糟：槽位被占住，而撤销它的那一半永远不会跑
    expect(() => database.branchMaterializationSource(createSource(), scope)).toThrow(LifecycleScopeDisposedError);
    expect(database.getBranchMaterializationSource()).toBeUndefined();
  });
});

describe('canonicalMaterializationJson', () => {
  it('键序无关：同一份内容恒得同一个字符串', () => {
    expect(canonicalMaterializationJson({ a: 1, b: { d: [1, { y: 2, x: 1 }], c: null } })).toBe(
      canonicalMaterializationJson({ b: { c: null, d: [1, { x: 1, y: 2 }] }, a: 1 })
    );
  });

  it('数组保序：顺序是内容的一部分', () => {
    expect(canonicalMaterializationJson(['a', 'b'])).not.toBe(canonicalMaterializationJson(['b', 'a']));
  });

  it('日期折成 ISO 字符串，与它落库再读回后的样子一致', () => {
    const at = new Date('2026-09-26T00:00:00.000Z');
    expect(canonicalMaterializationJson({ at })).toBe(canonicalMaterializationJson({ at: at.toISOString() }));
  });

  it('undefined 与 null 同一口径——落库后读回的也只会是 null', () => {
    expect(canonicalMaterializationJson(undefined)).toBe('null');
  });
});

describe('branchMaterializationPageFingerprint', () => {
  it('键序无关，内容一变指纹就变', () => {
    const fingerprint = branchMaterializationPageFingerprint({ repository: 'public:Note', rows: [1, 2] });

    expect(branchMaterializationPageFingerprint({ rows: [1, 2], repository: 'public:Note' })).toBe(fingerprint);
    expect(branchMaterializationPageFingerprint({ repository: 'public:Note', rows: [1, 3] })).not.toBe(fingerprint);
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('带域分隔：不等于同一规范化内容的裸 SHA-256', () => {
    // 不带前缀的话，一份恰好等于意图 scope 清单的 payload 会与意图算出同一个指纹
    const payload = { scope: ['public:Note'] };
    const bare = sha256Hex(new TextEncoder().encode(canonicalMaterializationJson(payload)));

    expect(branchMaterializationPageFingerprint(payload)).not.toBe(bare);
  });
});
