import { RxDBBranch, RxDBChange, type RxDB } from '@aiao/rxdb';
import { catchError, defer, map, of, startWith, switchMap, type Observable } from 'rxjs';
import { DASHBOARD_METRICS, normalizeDashboardChanges, type DashboardActivity } from './dashboard-model';

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

/** 读取当前分支的持久化业务日志，刷新页面后仍保留活动。 */
export function observeDashboardActivities(db: RxDB): Observable<DashboardActivityState> {
  return defer(() =>
    db.worktreeTableSet$.pipe(
      switchMap(tableSet => db.entityManager.getRepository(RxDBBranch).findOne({ where: tableSet.heldBranchWhere })),
      switchMap(branch => {
        if (!branch) return of([]);
        return db.entityManager.getRepository(RxDBChange).findAll({
          where: {
            combinator: 'and',
            rules: [
              { field: 'branchId', operator: '=', value: branch.id },
              { field: 'namespace', operator: '=', value: 'assets' },
              { field: 'entity', operator: 'in', value: DASHBOARD_METRICS.map(metric => metric.entityName) }
            ]
          },
          orderBy: [{ field: 'id', sort: 'desc' }]
        });
      }),
      map(changes => ({ activities: normalizeDashboardChanges(changes), loading: false, error: null }))
    )
  ).pipe(
    startWith(DASHBOARD_ACTIVITY_LOADING),
    catchError((cause: unknown) =>
      of({ activities: [], loading: false, error: cause instanceof Error ? cause.message : String(cause) })
    )
  );
}
