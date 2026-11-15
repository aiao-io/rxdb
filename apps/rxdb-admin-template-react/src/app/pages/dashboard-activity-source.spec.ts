import { RxDB, RxDBBranch, RxDBChange, SyncType } from '@aiao/rxdb';
import { BehaviorSubject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ENTITIES } from '../entities/asset-entities';
import { observeDashboardActivities, type DashboardActivityState } from './dashboard-activity-source';

const databases: RxDB[] = [];

function createScene() {
  const db = new RxDB({
    dbName: `dashboard-${crypto.randomUUID()}`,
    entities: [...ENTITIES],
    multiInstance: false,
    sync: { type: SyncType.None, local: { adapter: 'test' } }
  });
  db.init();
  databases.push(db);
  const branch$ = new BehaviorSubject<RxDBBranch | null>(Object.assign(new RxDBBranch(), { id: 'branch-a' }));
  const changes$ = new BehaviorSubject<RxDBChange[]>([]);
  vi.spyOn(db.entityManager.getRepository(RxDBBranch), 'findOne').mockReturnValue(branch$);
  const query = vi.spyOn(db.entityManager.getRepository(RxDBChange), 'findAll').mockReturnValue(changes$);
  const states: DashboardActivityState[] = [];
  return { db, branch$, changes$, query, states };
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map(db => db.destroy()));
  vi.restoreAllMocks();
});

describe('Dashboard 持久化活动', () => {
  it('先显示加载态，再显示当前分支日志，且不按当前会话开始时间过滤', () => {
    const scene = createScene();
    scene.changes$.next([
      Object.assign(new RxDBChange(), {
        id: 1,
        namespace: 'assets',
        entity: 'AssetCategory',
        type: 'INSERT',
        createdAt: new Date('2020-01-01T00:00:00Z')
      })
    ]);
    const subscription = observeDashboardActivities(scene.db).subscribe(state => scene.states.push(state));
    expect(scene.states[0]).toEqual({ activities: [], loading: true, error: null });
    expect(scene.states.at(-1)).toMatchObject({ activities: [{ changeId: 1 }], loading: false, error: null });
    expect(scene.query).toHaveBeenCalledWith({
      where: {
        combinator: 'and',
        rules: [
          { field: 'branchId', operator: '=', value: 'branch-a' },
          { field: 'namespace', operator: '=', value: 'assets' },
          { field: 'entity', operator: 'in', value: ['AssetCategory', 'Asset', 'AssetEvent'] }
        ]
      },
      orderBy: [{ field: 'id', sort: 'desc' }]
    });
    subscription.unsubscribe();
    expect(scene.branch$.observed).toBe(false);
    expect(scene.changes$.observed).toBe(false);
  });

  it('跟随分支重查，没有当前分支时显示空状态', () => {
    const scene = createScene();
    const subscription = observeDashboardActivities(scene.db).subscribe(state => scene.states.push(state));
    scene.branch$.next(Object.assign(new RxDBBranch(), { id: 'branch-b' }));
    expect(scene.query).toHaveBeenCalledTimes(2);
    expect(scene.query.mock.calls.at(-1)?.[0].where.rules[0]).toEqual({ field: 'branchId', operator: '=', value: 'branch-b' });
    scene.branch$.next(null);
    expect(scene.states.at(-1)).toEqual({ activities: [], loading: false, error: null });
    expect(scene.changes$.observed).toBe(false);
    subscription.unsubscribe();
  });

  it.each([new Error('日志查询失败'), '日志查询失败'])('查询失败显示错误，不能伪装成空历史：%s', cause => {
    const scene = createScene();
    const subscription = observeDashboardActivities(scene.db).subscribe(state => scene.states.push(state));
    scene.changes$.error(cause);
    expect(scene.states.at(-1)).toEqual({ activities: [], loading: false, error: '日志查询失败' });
    expect(subscription.closed).toBe(true);
  });
});
