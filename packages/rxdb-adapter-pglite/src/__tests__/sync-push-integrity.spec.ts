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
import type { EntityType, IRxDBChange, RemoteChangeResult } from '@aiao/rxdb';
import {
  Entity,
  EntityBase,
  OnDeleteAction,
  PropertyType,
  RelationKind,
  REPOSITORY_SYNC_BEGIN_EVENT,
  REPOSITORY_SYNC_COMPLETE_EVENT,
  REPOSITORY_SYNC_ERROR_EVENT,
  RxDB,
  RxDBChange,
  SyncType
} from '@aiao/rxdb';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';
import { afterEach, describe, expect, it } from 'vitest';

import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';
import {
  applied,
  newScript,
  rejected,
  SCRIPTED_REMOTE_ADAPTER as REMOTE_ADAPTER,
  ScriptedRemote,
  type RemoteScript
} from './scripted-remote-fixture.js';

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

// ==================== US-037 ====================

/** 一条外键：`child.column` 引用 `parent.id` */
interface ForeignKeyEdge {
  readonly child: string;
  readonly parent: string;
  readonly column: string;
}

/**
 * 按外键给回执的远端：子行新建时父行必须已在远端，父行删除时远端不能还有引用它的子行。
 *
 * @remarks
 * 模拟 Supabase `rxdb_mutations` 把 23503 记成 `reason: 'dependency'`。本文件的用例里每个实体只有一条源变更，
 * 逐条判定不会把同一实体拆成一半 applied、一半被拒。
 */
const foreignKeyReceipt = (edges: readonly ForeignKeyEdge[], remote = new Map<string, Record<string, unknown>>()) => {
  const rowKey = (entity: string, id: unknown): string => `${entity}:${String(id)}`;
  const referenced = (change: IRxDBChange): boolean =>
    edges.every(edge => {
      if (edge.child !== change.entity) return true;
      const parentId = change.patch?.[edge.column];
      return parentId == null || remote.has(rowKey(edge.parent, parentId));
    });
  const unreferenced = (change: IRxDBChange): boolean =>
    edges.every(
      edge =>
        edge.parent !== change.entity ||
        ![...remote].some(([key, row]) => key.startsWith(`${edge.child}:`) && row[edge.column] === change.entityId)
    );

  return {
    remote,
    receipt: (change: IRxDBChange): RemoteChangeResult => {
      const key = rowKey(change.entity, change.entityId);
      if (change.type === 'DELETE') {
        if (!unreferenced(change)) return rejected(change, 'dependency');
        remote.delete(key);
        return applied(change);
      }
      if (!referenced(change)) return rejected(change, 'dependency');
      remote.set(key, { ...remote.get(key), ...change.patch });
      return applied(change);
    }
  };
};

@Entity({ name: 'FkParent', properties: [{ name: 'title', type: PropertyType.string }] })
class FkParent extends EntityBase {
  title!: string;
}

@Entity({
  name: 'FkChild',
  properties: [{ name: 'title', type: PropertyType.string }],
  relations: [{ name: 'parent', kind: RelationKind.MANY_TO_ONE, mappedEntity: 'FkParent', mappedProperty: 'children' }]
})
class FkChild extends EntityBase {
  title!: string;
  parentId!: string;
}

/** 只用实体级 `foreignKeys` 引用父表（AC#9） */
@Entity({
  name: 'FkKeyedChild',
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'parentKey', type: PropertyType.uuid }
  ],
  foreignKeys: [
    { name: 'fk_keyed_child_parent', properties: ['parentKey'], mappedEntity: 'FkParent', mappedProperties: ['id'] }
  ]
})
class FkKeyedChild extends EntityBase {
  title!: string;
  parentKey!: string;
}

const CHILD_EDGE: ForeignKeyEdge = { child: 'FkChild', parent: 'FkParent', column: 'parentId' };

describe('推送按外键依赖排序（US-037）', () => {
  const saveParent = async (title = 'parent'): Promise<FkParent> => {
    const parent = new FkParent();
    parent.title = title;
    await parent.save();
    return parent;
  };

  const saveChild = async (parent: FkParent, title = 'child'): Promise<FkChild> => {
    const child = new FkChild();
    child.title = title;
    child.parentId = parent.id;
    await child.save();
    return child;
  };

  /** 远端按调用顺序收到的 `实体:操作` */
  const sentOrder = (script: RemoteScript): string[] =>
    script.calls.flatMap(call => call.changes.map(change => `${change.entity}:${change.type}`));

  it('AC#1：子实体声明在前，父子同批新建都被接受，本地子行保留并拿到 remoteId', async () => {
    const fk = foreignKeyReceipt([CHILD_EDGE]);
    const script = newScript(fk.receipt);
    const database = await createDatabase([FkChild, FkParent], script);
    const parent = await saveParent();
    const child = await saveChild(parent);

    const result = await database.syncManager.push();

    expect(sentOrder(script)).toEqual(['FkParent:INSERT', 'FkChild:INSERT']);
    expect(result).toMatchObject({ pushed: 2, rejected: 0, failures: [] });
    expect((await localRows(database, FkChild)).map(row => row.id)).toEqual([child.id]);
    const childChange = (await localChanges(database)).find(change => change.entity === 'FkChild');
    expect(childChange?.remoteId).toEqual(expect.any(Number));
    expect(childChange?.rejectedAt ?? null).toBeNull();
    expect(fk.remote.has(`FkChild:${child.id}`)).toBe(true);
  });

  it('AC#3：删旧建新混在一批，删除子先父后、新建父先子后，四条都被接受', async () => {
    const fk = foreignKeyReceipt([CHILD_EDGE]);
    const script = newScript(fk.receipt);
    const database = await createDatabase([FkChild, FkParent], script);
    const oldParent = await saveParent('old-parent');
    const oldChild = await saveChild(oldParent, 'old-child');
    await database.syncManager.push();
    script.calls.length = 0;

    await oldChild.remove();
    await oldParent.remove();
    const newParent = await saveParent('new-parent');
    const newChild = await saveChild(newParent, 'new-child');

    const result = await database.syncManager.push();

    expect(sentOrder(script)).toEqual(['FkChild:DELETE', 'FkParent:DELETE', 'FkParent:INSERT', 'FkChild:INSERT']);
    expect(result).toMatchObject({ pushed: 4, rejected: 0, failures: [] });
    expect([...fk.remote.keys()].sort()).toEqual([`FkChild:${newChild.id}`, `FkParent:${newParent.id}`].sort());
  });

  it('AC#5：只推子仓时父仓一起推、父行在前，子行被接受', async () => {
    const fk = foreignKeyReceipt([CHILD_EDGE]);
    const script = newScript(fk.receipt);
    const database = await createDatabase([FkChild, FkParent], script);
    await saveChild(await saveParent());

    const result = await database.syncManager.pushRepository('public', 'FkChild');

    expect(sentOrder(script)).toEqual(['FkParent:INSERT', 'FkChild:INSERT']);
    expect(result).toMatchObject({ pushed: 1, rejected: 0, failures: [] });
    expect(result.relatedResults?.map(related => [related.repository.entity, related.pushed])).toEqual([
      ['FkParent', 1]
    ]);
  });

  it('AC#7：远端父行已被别的客户端删掉时，子行仍以 dependency 被拒并对齐本地（US-218 语义不变）', async () => {
    const fk = foreignKeyReceipt([CHILD_EDGE]);
    const script = newScript(fk.receipt);
    const database = await createDatabase([FkChild, FkParent], script);
    const parent = await saveParent();
    await database.syncManager.push();
    fk.remote.delete(`FkParent:${parent.id}`);
    const child = await saveChild(parent);

    const result = await database.syncManager.push();

    expect(result).toMatchObject({ pushed: 0, rejected: 1 });
    expect(await localRows(database, FkChild)).toEqual([]);
    const [rejection] = database.syncState.snapshot.lastRejections;
    expect(rejection).toMatchObject({ entity: 'FkChild', entityId: child.id, reason: 'dependency' });
  });

  it('AC#9：只用实体级 foreignKeys 引用、引用方声明在前，被引用的行先到远端', async () => {
    const fk = foreignKeyReceipt([{ child: 'FkKeyedChild', parent: 'FkParent', column: 'parentKey' }]);
    const script = newScript(fk.receipt);
    const database = await createDatabase([FkKeyedChild, FkParent], script);
    const parent = await saveParent();
    const child = new FkKeyedChild();
    child.title = 'keyed';
    child.parentKey = parent.id;
    await child.save();

    const result = await database.syncManager.push();

    expect(sentOrder(script)).toEqual(['FkParent:INSERT', 'FkKeyedChild:INSERT']);
    expect(result).toMatchObject({ pushed: 2, rejected: 0 });
  });

  it('AC#11：库级 Full 时系统表不进推送：失败清单与仓库事件里都没有系统表', async () => {
    const script = newScript();
    const database = await createDatabase([FkChild, FkParent], script);
    await saveChild(await saveParent());
    const namespaces: string[] = [];
    const record = (event: { namespace: string }): void => {
      namespaces.push(event.namespace);
    };
    database.addEventListener(REPOSITORY_SYNC_BEGIN_EVENT, record);
    database.addEventListener(REPOSITORY_SYNC_COMPLETE_EVENT, record);
    database.addEventListener(REPOSITORY_SYNC_ERROR_EVENT, record);

    const result = await database.syncManager.push();

    expect(result.failures).toEqual([]);
    expect(new Set(namespaces)).toEqual(new Set(['public']));
  });
});
