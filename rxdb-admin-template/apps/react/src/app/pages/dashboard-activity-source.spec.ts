import {
  EntityLocalCreatedEvent,
  EntityLocalUpdatedEvent,
  RxDB,
  RxDBBranch,
  RxDBChange,
  SyncType,
  type RawQueryResult
} from '@aiao/rxdb';
import { BehaviorSubject, of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ENTITIES } from '../entities/asset-entities';
import { observeDashboardActivities, type DashboardActivityState } from './dashboard-activity-source';

const databases: RxDB[] = [];
const empty: RawQueryResult = { rows: [], columns: [], rowsAffected: 0 };
const result: RawQueryResult = {
  ...empty,
  rows: [[1, 'assets', 'AssetCategory', 'INSERT', 1, '2020-01-01T00:00:00.000Z', 0, 0, '1']]
};

async function createScene() {
  const db = new RxDB({
    dbName: `dashboard-${crypto.randomUUID()}`,
    entities: [...ENTITIES],
    multiInstance: false,
    sync: { type: SyncType.None, local: { adapter: 'test' } }
  });
  db.init();
  databases.push(db);
  const { RxDBAdapterSqlite } = await import('@aiao/rxdb-adapter-sqlite-wasm');
  const adapter = new RxDBAdapterSqlite(db, { vfs: 'idb' });
  vi.spyOn(db, 'getAdapter').mockResolvedValue(adapter);
  const branch$ = new BehaviorSubject<RxDBBranch | null>(Object.assign(new RxDBBranch(), { id: 'branch-a' }));
  vi.spyOn(db.entityManager.getRepository(RxDBBranch), 'findOne').mockReturnValue(branch$);
  const fullQuery = vi.spyOn(db.entityManager.getRepository(RxDBChange), 'findAll').mockReturnValue(of([]));
  const query = vi.spyOn(adapter, 'rawQuery').mockResolvedValue(result);
  const addListener = vi.spyOn(db, 'addEventListener');
  const removeListener = vi.spyOn(db, 'removeEventListener');
  const states: DashboardActivityState[] = [];
  return { db, branch$, query, fullQuery, states, addListener, removeListener };
}

function notifyChange(db: RxDB, namespace = 'rxdb', entity = 'RxDBChange') {
  db.dispatchEvent(
    new EntityLocalUpdatedEvent([
      {
        namespace,
        entity,
        type: 'UPDATE',
        id: 1,
        recordAt: new Date(),
        patch: { revertChangeId: 2 },
        inversePatch: { revertChangeId: null },
        origin: 'cross-tab'
      }
    ])
  );
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map(db => db.destroy()));
  vi.restoreAllMocks();
});

describe('Dashboard 持久化活动', () => {
  it('先显示加载态，只读取当前分支五个聚合操作，不实例化完整日志', async () => {
    const scene = await createScene();
    const subscription = observeDashboardActivities(scene.db).subscribe(state => scene.states.push(state));
    expect(scene.states[0]).toEqual({ activities: [], loading: true, error: null });
    await vi.waitFor(() =>
      expect(scene.states.at(-1)).toMatchObject({ activities: [{ changeId: 1 }], loading: false, error: null })
    );
    expect(scene.query).toHaveBeenCalledWith(expect.stringContaining('GROUP BY latest.changeId'), [
      'branch-a',
      'assets',
      'AssetCategory',
      'Asset',
      'AssetEvent'
    ]);
    expect(scene.fullQuery).not.toHaveBeenCalled();
    subscription.unsubscribe();
    expect(scene.branch$.observed).toBe(false);
    for (const [event, listener] of scene.addListener.mock.calls)
      expect(scene.removeListener).toHaveBeenCalledWith(event, listener);
  });

  it('跟随分支重查，没有当前分支时显示空状态并停止监听', async () => {
    const scene = await createScene();
    const subscription = observeDashboardActivities(scene.db).subscribe(state => scene.states.push(state));
    await vi.waitFor(() => expect(scene.query).toHaveBeenCalledTimes(1));
    scene.branch$.next(Object.assign(new RxDBBranch(), { id: 'branch-b' }));
    await vi.waitFor(() => expect(scene.query).toHaveBeenCalledTimes(2));
    expect(scene.query.mock.calls.at(-1)?.[1]?.[0]).toBe('branch-b');
    scene.branch$.next(null);
    expect(scene.states.at(-1)).toEqual({ activities: [], loading: false, error: null });
    notifyChange(scene.db);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(scene.query).toHaveBeenCalledTimes(2);
    subscription.unsubscribe();
  });

  it('日志条数不变的撤销和跨标签页更新也重查，同轮通知只查一次', async () => {
    const scene = await createScene();
    const subscription = observeDashboardActivities(scene.db).subscribe(state => scene.states.push(state));
    await vi.waitFor(() => expect(scene.states.at(-1)?.loading).toBe(false));
    scene.query.mockResolvedValue({
      ...result,
      rows: [[1, 'assets', 'AssetCategory', 'INSERT', 1, '2020-01-01', 1, 1, '1']]
    });
    notifyChange(scene.db);
    notifyChange(scene.db);
    scene.db.dispatchEvent(
      new EntityLocalCreatedEvent([
        {
          namespace: 'rxdb',
          entity: 'RxDBChange',
          type: 'INSERT',
          id: 2,
          recordAt: new Date(),
          patch: Object.assign(new RxDBChange(), { id: 2 }),
          inversePatch: null
        }
      ])
    );
    await vi.waitFor(() =>
      expect(scene.states.at(-1)?.activities[0]).toMatchObject({ reverted: true, redoInvalidated: true })
    );
    expect(scene.query).toHaveBeenCalledTimes(2);
    notifyChange(scene.db, 'assets', 'Asset');
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(scene.query).toHaveBeenCalledTimes(2);
    subscription.unsubscribe();
  });

  it('分支切换后丢弃旧查询的迟到结果，退订后停止查询', async () => {
    const scene = await createScene();
    let resolveOld!: (value: RawQueryResult) => void;
    scene.query
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveOld = resolve;
          })
      )
      .mockResolvedValue(empty);
    const subscription = observeDashboardActivities(scene.db).subscribe(state => scene.states.push(state));
    await vi.waitFor(() => expect(scene.query).toHaveBeenCalledTimes(1));
    scene.branch$.next(Object.assign(new RxDBBranch(), { id: 'branch-b' }));
    await vi.waitFor(() => expect(scene.states.at(-1)).toEqual({ activities: [], loading: false, error: null }));
    resolveOld(result);
    await Promise.resolve();
    expect(scene.states.at(-1)?.activities).toEqual([]);
    subscription.unsubscribe();
    notifyChange(scene.db);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(scene.query).toHaveBeenCalledTimes(2);
  });

  it.each([new Error('日志查询失败'), '日志查询失败'])('查询失败显示错误并保留事件监听：%s', async cause => {
    const scene = await createScene();
    scene.query.mockRejectedValueOnce(cause).mockResolvedValue(result);
    const subscription = observeDashboardActivities(scene.db).subscribe(state => scene.states.push(state));
    await vi.waitFor(() =>
      expect(scene.states.at(-1)).toEqual({ activities: [], loading: false, error: '日志查询失败' })
    );
    expect(subscription.closed).toBe(false);
    notifyChange(scene.db);
    await vi.waitFor(() => expect(scene.query).toHaveBeenCalledTimes(2));
    await vi.waitFor(() =>
      expect(scene.states.at(-1)).toMatchObject({ activities: [{ changeId: 1 }], loading: false, error: null })
    );
    subscription.unsubscribe();
  });
});
