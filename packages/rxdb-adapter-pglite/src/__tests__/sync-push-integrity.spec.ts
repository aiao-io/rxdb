/**
 * @fileoverview 推送回执落库的完整性 —— 真实 PGlite 本地 + 脚本化远端替身。
 *
 * @remarks
 * 三个命题都是「远端回执已经拿到，本地能不能安全提交」：
 *
 * 1. **多仓被拒清单汇总**：一次 `push()` / `bulkSync()` 内各仓的被拒清单汇总后整体上报一次，
 *    与返回的 `rejected` 计数覆盖同一批实体；逐仓上报会互相覆盖（`reportRejections` 整体替换）。
 * 2. **远端往返期间切换分支**：被拒对齐改写的是**当前 active 分支**的业务投影。计划所属分支
 *    在往返期间不再 active（含 A→B→A）时，本轮不落库，下一轮重推。
 * 3. **级联被拒的本地对齐**：被拒的新建要在本地删除（子先父后），被拒的删除要在本地恢复
 *    （父先子后）；RESTRICT 与 CASCADE 两种外键都必须首轮落定，第二轮不再发送。
 *
 * 替身只在**远端**一侧：本地事务、触发器、外键与 `executor.mergeChanges` 全是真的——
 * 这几个问题都出在本地提交上，mock 掉本地就测不到。
 */
import type {
  EntityType,
  IRepository,
  IRxDBAdapter,
  IRxDBChange,
  QueryCacheEntityMetadata,
  RemoteChange,
  RemoteChangeResult,
  RemoteMergeResult
} from '@aiao/rxdb';
import {
  Entity,
  EntityBase,
  OnDeleteAction,
  PropertyType,
  RelationKind,
  RxDB,
  RxDBAdapterRemoteBase,
  RxDBChange,
  SyncType
} from '@aiao/rxdb';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';
import { Observable, of } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';

import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';

const REMOTE_ADAPTER = 'push-integrity-remote';

/** 一次 `mergeChanges` 调用 */
interface MergeCall {
  readonly branchId: string | undefined;
  readonly changes: readonly IRxDBChange[];
}

/** 远端替身的剧本：逐条源变更给回执，可在回执返回前插入本地动作 */
interface RemoteScript {
  /** 逐条源变更的回执；抛错即整次 `mergeChanges` 失败 */
  receipt: (change: IRxDBChange) => RemoteChangeResult;
  /** 回执返回前的钩子：模拟远端往返期间发生在本地的动作 */
  beforeReply?: (call: MergeCall) => Promise<void>;
  /** 远端当前行，键为 `namespace:entity:id`（与 `findByIds` 的实体名 + id 拼接一致） */
  readonly rows: Map<string, Record<string, unknown>>;
  /** 全部 `mergeChanges` 调用记录 */
  readonly calls: MergeCall[];
}

/**
 * 按剧本回执的远端替身
 *
 * @remarks
 * 拉取侧一律为空：本文件只测推送回执的本地提交。
 */
class ScriptedRemote extends RxDBAdapterRemoteBase implements IRxDBAdapter {
  readonly name = REMOTE_ADAPTER;

  constructor(
    rxdb: RxDB,
    readonly script: RemoteScript
  ) {
    super(rxdb);
  }

  connect(): Promise<IRxDBAdapter> {
    return Promise.resolve(this);
  }

  disconnect(): Promise<void> {
    return Promise.resolve();
  }

  version(): Promise<string> {
    return Promise.resolve(REMOTE_ADAPTER);
  }

  /** 同步插件会顺手取远端系统表仓库；推送回执不读它，给一个永远为空的只读句柄 */
  getRepository<T extends EntityType, RT extends IRepository<T> = IRepository<T>>(): RT {
    return { find: () => Promise.resolve([]), count: () => Promise.resolve(0) } as unknown as RT;
  }

  saveMany(): Promise<never> {
    return Promise.reject(new Error('scripted-remote: 只经 mergeChanges 写入'));
  }

  removeMany(): Promise<never> {
    return Promise.reject(new Error('scripted-remote: 只经 mergeChanges 写入'));
  }

  mutations(): Promise<never> {
    return Promise.reject(new Error('scripted-remote: 只经 mergeChanges 写入'));
  }

  isTableExisted(): Promise<boolean> {
    return Promise.resolve(true);
  }

  pullChanges(): Promise<RemoteChange[]> {
    return Promise.resolve([]);
  }

  getChangeCount(sinceId: number): Promise<{ count: number; latestChangeId: number }> {
    return Promise.resolve({ count: 0, latestChangeId: sinceId });
  }

  async mergeChanges(_actions: unknown, branchId?: string, changes: IRxDBChange[] = []): Promise<RemoteMergeResult> {
    const call: MergeCall = { branchId, changes: [...changes] };
    this.script.calls.push(call);
    await this.script.beforeReply?.(call);
    return { results: changes.map(change => this.script.receipt(change)) };
  }

  fetchMetadata(): Observable<QueryCacheEntityMetadata[]> {
    return of([]);
  }

  findByIds<T>(entityName: string, ids: string[]): Observable<T[]> {
    return of(
      ids.flatMap(id => {
        const row = this.script.rows.get(`${entityName}:${id}`);
        return row ? [structuredClone(row) as T] : [];
      })
    );
  }

  override pushBranches(branches: Record<string, unknown>[]): Promise<{ synced: number; skipped: string[] }> {
    return Promise.resolve({ synced: branches.length, skipped: [] });
  }
}

const applied = (change: IRxDBChange): RemoteChangeResult => ({
  localId: change.id,
  status: 'applied',
  remoteId: change.id + 1000
});

const rejected = (change: IRxDBChange, reason: 'denied' | 'dependency' = 'denied'): RemoteChangeResult => ({
  localId: change.id,
  status: 'rejected',
  rejection: {
    code: reason === 'denied' ? '42501' : '23503',
    reason,
    message: `rejected ${change.entity}`,
    entity: { namespace: change.namespace, entity: change.entity, entityId: String(change.entityId) },
    ...(reason === 'dependency' ? { dependsOn: { constraint: 'parent_fk' } } : {})
  }
});

const newScript = (receipt: RemoteScript['receipt'] = applied): RemoteScript => ({
  receipt,
  rows: new Map(),
  calls: []
});

// ==================== 实体 ====================

@Entity({ name: 'IntegrityAlpha', properties: [{ name: 'title', type: PropertyType.string }] })
class IntegrityAlpha extends EntityBase {
  title!: string;
}

@Entity({ name: 'IntegrityBeta', properties: [{ name: 'title', type: PropertyType.string }] })
class IntegrityBeta extends EntityBase {
  title!: string;
}

@Entity({ name: 'IntegrityItem', properties: [{ name: 'title', type: PropertyType.string }] })
class IntegrityItem extends EntityBase {
  title!: string;
}

@Entity({ name: 'RestrictParent', properties: [{ name: 'title', type: PropertyType.string }] })
class RestrictParent extends EntityBase {
  title!: string;
}

@Entity({
  name: 'RestrictChild',
  properties: [{ name: 'title', type: PropertyType.string }],
  relations: [
    {
      name: 'parent',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'RestrictParent',
      mappedProperty: 'children',
      onDelete: OnDeleteAction.RESTRICT
    }
  ]
})
class RestrictChild extends EntityBase {
  title!: string;
  parentId!: string;
}

@Entity({ name: 'CascadeParent', properties: [{ name: 'title', type: PropertyType.string }] })
class CascadeParent extends EntityBase {
  title!: string;
}

@Entity({
  name: 'CascadeChild',
  properties: [{ name: 'title', type: PropertyType.string }],
  relations: [
    {
      name: 'parent',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'CascadeParent',
      mappedProperty: 'children',
      onDelete: OnDeleteAction.CASCADE
    }
  ]
})
class CascadeChild extends EntityBase {
  title!: string;
  parentId!: string;
}

// ==================== 装配 ====================

const opened: RxDB[] = [];

afterEach(async () => {
  const pending = opened.splice(0);
  for (const database of pending) await database.disconnectAll();
});

const createDatabase = async (entities: EntityType[], script: RemoteScript): Promise<RxDB> => {
  const database = new RxDB({
    dbName: `sync-push-integrity-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    context: { userId: 'push-integrity' },
    entities,
    sync: { type: SyncType.Full, local: { adapter: 'pglite' }, remote: { adapter: REMOTE_ADAPTER } }
  });
  database.adapter('pglite', async db => new RxDBAdapterPGlite(db, { store: 'memory' }));
  database.adapter(REMOTE_ADAPTER, async db => new ScriptedRemote(db, script));
  database.use(rxDBPluginSync);
  database.use(rxDBPluginHistory);
  opened.push(database);
  await database.connect('pglite');
  await database.connect(REMOTE_ADAPTER);
  await database.versionManager.getCurrentBranch();
  return database;
};

const localRows = async <T extends EntityType>(database: RxDB, EntityClass: T): Promise<InstanceType<T>[]> => {
  const adapter = await database.getAdapter('pglite');
  return adapter.getRepository(EntityClass).find({ where: { combinator: 'and', rules: [] } });
};

const localChanges = async (database: RxDB): Promise<RxDBChange[]> => {
  const adapter = await database.getAdapter('pglite');
  return adapter.getRepository(RxDBChange).find({ where: { combinator: 'and', rules: [] } });
};

/** 远端行：取本地实体的可枚举字段，模拟远端整行返回 */
const remoteRowOf = (entity: EntityBase, overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  ...(structuredClone({ ...entity }) as Record<string, unknown>),
  ...overrides
});

// ==================== R4 ====================

describe('一次推送内多仓被拒清单汇总', () => {
  const seedTwoRejected = async (): Promise<RxDB> => {
    const database = await createDatabase(
      [IntegrityAlpha, IntegrityBeta],
      newScript(change => rejected(change))
    );
    const alpha = new IntegrityAlpha();
    alpha.title = 'alpha';
    await alpha.save();
    const beta = new IntegrityBeta();
    beta.title = 'beta';
    await beta.save();
    return database;
  };

  it('push() 两个独立仓库各一条被拒新建：lastRejections 与 rejected 计数覆盖同两条', async () => {
    const database = await seedTwoRejected();

    const result = await database.syncManager.push();

    expect(result.rejected).toBe(2);
    const reported = database.syncState.snapshot.lastRejections.map(rejection => rejection.entity).sort();
    expect(reported).toEqual(['IntegrityAlpha', 'IntegrityBeta']);
  });

  it('bulkSync 并发推送：同样汇总后只报一次', async () => {
    const database = await seedTwoRejected();

    const result = await database.syncManager.bulkSync({ operation: 'push', concurrent: true, concurrency: 2 });

    expect(result.failed).toBe(0);
    const reported = database.syncState.snapshot.lastRejections.map(rejection => rejection.entity).sort();
    expect(reported).toEqual(['IntegrityAlpha', 'IntegrityBeta']);
  });

  it('前仓被拒已落库、后仓推送失败：已落库的被拒照报', async () => {
    const database = await createDatabase(
      [IntegrityAlpha, IntegrityBeta],
      newScript(change => {
        if (change.entity === 'IntegrityBeta') throw new Error('remote unavailable');
        return rejected(change);
      })
    );
    const alpha = new IntegrityAlpha();
    alpha.title = 'alpha';
    await alpha.save();
    const beta = new IntegrityBeta();
    beta.title = 'beta';
    await beta.save();

    const result = await database.syncManager.push();

    expect(result.rejected).toBe(1);
    expect(result.failures.map(failure => failure.repository?.entity)).toEqual(['IntegrityBeta']);
    expect(database.syncState.snapshot.lastRejections.map(rejection => rejection.entity)).toEqual(['IntegrityAlpha']);
  });
});

// ==================== R1 ====================

describe('远端往返期间切换分支', () => {
  /**
   * main 上一行 `base` 已推送；feature 从那里分叉并改成 `feature-private-edit`；
   * 回到 main 改成 `main-denied-edit`，这条待推、远端会拒。
   */
  const seedDivergedBranches = async (script: RemoteScript): Promise<{ database: RxDB; item: IntegrityItem }> => {
    const database = await createDatabase([IntegrityItem], script);
    const item = new IntegrityItem();
    item.title = 'base';
    await item.save();
    script.rows.set(`public:IntegrityItem:${item.id}`, remoteRowOf(item));
    await database.syncManager.pushRepository('public', 'IntegrityItem', { includeRelated: false });

    const [baseChange] = await localChanges(database);
    await database.versionManager.createBranch('feature', baseChange.id);
    await database.versionManager.switchBranch('feature');
    item.title = 'feature-private-edit';
    await item.save();
    await database.versionManager.switchBranch('main');
    item.title = 'main-denied-edit';
    await item.save();
    script.receipt = change => rejected(change);
    return { database, item };
  };

  const mainDeniedChange = async (database: RxDB): Promise<RxDBChange> => {
    const changes = await localChanges(database);
    const change = changes.find(c => c.branchId === 'main' && c.patch?.['title'] === 'main-denied-edit');
    if (!change) throw new Error('main 上的待拒变更缺失');
    return change;
  };

  it('main 推送在飞时切到 feature：feature 行不被改写，本轮不落库；切回 main 重推后对齐', async () => {
    const script = newScript();
    const { database } = await seedDivergedBranches(script);
    script.beforeReply = async () => {
      script.beforeReply = undefined;
      await database.versionManager.switchBranch('feature');
    };

    await expect(
      database.syncManager.pushRepository('public', 'IntegrityItem', { includeRelated: false })
    ).rejects.toThrow();

    expect((await database.versionManager.getCurrentBranch()).id).toBe('feature');
    expect((await localRows(database, IntegrityItem)).map(row => row.title)).toEqual(['feature-private-edit']);
    expect((await mainDeniedChange(database)).rejectedAt ?? null).toBeNull();

    await database.versionManager.switchBranch('main');
    const retry = await database.syncManager.pushRepository('public', 'IntegrityItem', { includeRelated: false });

    expect(retry.rejected).toBe(1);
    expect((await mainDeniedChange(database)).rejectedAt).toBeInstanceOf(Date);
    expect((await localRows(database, IntegrityItem)).map(row => row.title)).toEqual(['base']);
    await database.versionManager.switchBranch('feature');
    expect((await localRows(database, IntegrityItem)).map(row => row.title)).toEqual(['feature-private-edit']);
  });

  it('往返期间 main→feature→main：激活代际已变，本轮不落库，下一轮重推完成对齐', async () => {
    const script = newScript();
    const { database } = await seedDivergedBranches(script);
    script.beforeReply = async () => {
      script.beforeReply = undefined;
      await database.versionManager.switchBranch('feature');
      await database.versionManager.switchBranch('main');
    };

    await expect(
      database.syncManager.pushRepository('public', 'IntegrityItem', { includeRelated: false })
    ).rejects.toThrow();
    expect((await mainDeniedChange(database)).rejectedAt ?? null).toBeNull();

    const retry = await database.syncManager.pushRepository('public', 'IntegrityItem', { includeRelated: false });

    expect(retry.rejected).toBe(1);
    expect((await localRows(database, IntegrityItem)).map(row => row.title)).toEqual(['base']);
  });
});

// ==================== R2 ====================

describe('级联被拒的本地对齐', () => {
  const pairs = [
    {
      label: 'RESTRICT',
      Parent: RestrictParent,
      Child: RestrictChild,
      parentName: 'RestrictParent',
      childName: 'RestrictChild'
    },
    {
      label: 'CASCADE',
      Parent: CascadeParent,
      Child: CascadeChild,
      parentName: 'CascadeParent',
      childName: 'CascadeChild'
    }
  ] as const;

  const parentChildReceipt =
    (parentName: string) =>
    (change: IRxDBChange): RemoteChangeResult =>
      rejected(change, change.entity === parentName ? 'denied' : 'dependency');

  it.each(pairs)(
    '$label：父 denied、子 dependency 的新建首轮全部落定，第二轮不再发送',
    async ({ Parent, Child, parentName }) => {
      const script = newScript();
      script.receipt = parentChildReceipt(parentName);
      const database = await createDatabase([Parent, Child], script);
      const parent = new Parent();
      parent.title = 'parent';
      await parent.save();
      const child = new Child();
      child.title = 'child';
      child.parentId = parent.id;
      await child.save();

      const result = await database.syncManager.pushRepository('public', parentName);

      expect(result.failures).toEqual([]);
      expect(result.rejected + (result.relatedResults ?? []).reduce((sum, r) => sum + r.rejected, 0)).toBe(2);
      expect((await localChanges(database)).every(change => change.rejectedAt instanceof Date)).toBe(true);
      expect(await localRows(database, Parent)).toEqual([]);
      expect(await localRows(database, Child)).toEqual([]);
      expect(database.syncState.snapshot.lastRejections).toHaveLength(2);

      const sent = script.calls.length;
      const retry = await database.syncManager.pushRepository('public', parentName);

      expect(script.calls).toHaveLength(sent);
      expect(retry.originalCount).toBe(0);
    }
  );

  it.each(pairs)(
    '$label：父子删除都被拒且远端有行，本地按父先子后恢复',
    async ({ Parent, Child, parentName, childName }) => {
      const script = newScript();
      const database = await createDatabase([Parent, Child], script);
      const parent = new Parent();
      parent.title = 'parent';
      await parent.save();
      const child = new Child();
      child.title = 'child';
      child.parentId = parent.id;
      await child.save();
      await database.syncManager.pushRepository('public', parentName);
      script.rows.set(`public:${parentName}:${parent.id}`, remoteRowOf(parent));
      script.rows.set(`public:${childName}:${child.id}`, remoteRowOf(child));

      await child.remove();
      await parent.remove();
      script.receipt = change => rejected(change);

      const result = await database.syncManager.pushRepository('public', parentName);

      expect(result.failures).toEqual([]);
      expect((await localRows(database, Parent)).map(row => row.id)).toEqual([parent.id]);
      expect((await localRows(database, Child)).map(row => row.parentId)).toEqual([parent.id]);
    }
  );
});
