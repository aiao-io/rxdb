import {
  ENTITY_LOCAL_CREATE_EVENT,
  ENTITY_LOCAL_REMOVE_EVENT,
  ENTITY_LOCAL_UPDATE_EVENT,
  RxDBBranch,
  RxDBChange,
  getEntityMetadata,
  type EntityLocalCreatedEvent,
  type EntityLocalRemovedEvent,
  type EntityLocalUpdatedEvent,
  type IRxDBAdapter,
  type RxDB
} from '@aiao/rxdb';
import { Observable, auditTime, catchError, defer, map, of, startWith, switchMap } from 'rxjs';
import { dashboardActivitySql, decodeDashboardActivities } from './dashboard-activity-query';
import { DASHBOARD_METRICS, type DashboardActivity } from './dashboard-model';

export interface DashboardActivityState {
  readonly activities: readonly DashboardActivity[];
  readonly loading: boolean;
  readonly error: string | null;
}

export const DASHBOARD_ACTIVITY_LOADING: DashboardActivityState = {
  activities: [],
  loading: true,
  error: null
};

const CHANGE_EVENTS = [ENTITY_LOCAL_CREATE_EVENT, ENTITY_LOCAL_UPDATE_EVENT, ENTITY_LOCAL_REMOVE_EVENT] as const;

function dashboardChangeEvents(db: RxDB): Observable<void> {
  return new Observable(subscriber => {
    const notify = (event: EntityLocalCreatedEvent | EntityLocalUpdatedEvent | EntityLocalRemovedEvent) => {
      if (event.entities.some(entry => entry.namespace === 'rxdb' && entry.entity === 'RxDBChange')) subscriber.next();
    };
    for (const type of CHANGE_EVENTS) db.addEventListener(type, notify);
    return () => {
      for (const type of CHANGE_EVENTS) db.removeEventListener(type, notify);
    };
  });
}

async function readDashboardActivities(
  db: RxDB,
  adapter: IRxDBAdapter,
  branchId: string
): Promise<DashboardActivity[]> {
  if (!adapter.rawQuery) throw new Error('Dashboard requires a SQLite raw query adapter');
  const { sqliteGetTableNameByMetadata } = await import('@aiao/rxdb-adapter-sqlite-wasm');
  const table = sqliteGetTableNameByMetadata(getEntityMetadata(RxDBChange), db.worktreeTableSet);
  const result = await adapter.rawQuery(dashboardActivitySql(table), [
    branchId,
    'assets',
    ...DASHBOARD_METRICS.map(metric => metric.entityName)
  ]);
  return decodeDashboardActivities(result);
}

function observeBranchActivities(db: RxDB, branchId: string): Observable<DashboardActivity[]> {
  return db.localAdapter$.pipe(
    switchMap(adapter =>
      dashboardChangeEvents(db).pipe(
        startWith(undefined),
        auditTime(0),
        switchMap(() => readDashboardActivities(db, adapter, branchId))
      )
    )
  );
}

/** 在 SQLite 中聚合当前分支持久化日志，只把五个完整操作单元交给页面。 */
export function observeDashboardActivities(db: RxDB): Observable<DashboardActivityState> {
  return defer(() =>
    db.worktreeTableSet$.pipe(
      switchMap(tableSet => db.entityManager.getRepository(RxDBBranch).findOne({ where: tableSet.heldBranchWhere })),
      switchMap(branch => (branch ? observeBranchActivities(db, branch.id) : of([]))),
      map(activities => ({ activities, loading: false, error: null }))
    )
  ).pipe(
    startWith(DASHBOARD_ACTIVITY_LOADING),
    catchError((cause: unknown) =>
      of({ activities: [], loading: false, error: cause instanceof Error ? cause.message : String(cause) })
    )
  );
}
