import { isNetworkError, SyncType, type FindOptions, type ReachabilityMonitor, type RxDB } from '@aiao/rxdb';
import { catchError, defer, merge, Observable, of, switchMap, throwError } from 'rxjs';
import { RemoteMessageEntry } from './entities.js';

const QUERY: FindOptions<typeof RemoteMessageEntry> = {
  where: { combinator: 'and', rules: [] },
  localCacheFirst: true,
  offlineFallback: true
};

/** 可选远端目录的查询与既有可达性端口。 */
export interface RemoteCatalogSourceOptions {
  /** 官方响应式仓储查询。 */
  readonly query: () => Observable<RemoteMessageEntry[]>;
  /** 本地目录快照；空数组表示没有远端覆盖。 */
  readonly local: () => Promise<RemoteMessageEntry[]>;
  /** 宿主拥有的可达性监视器。 */
  readonly reachability: Pick<ReachabilityMonitor, 'watch' | 'wakeup$'>;
}

/**
 * 可选远端离线时保留本地目录，并沿宿主可达性节拍恢复官方查询。
 * @param options - 查询、本地目录与可达性端口。
 * @returns 不因网络离线终结的目录流；业务与存储错误仍原样上抛。
 */
export const createRemoteCatalogSource = (options: RemoteCatalogSourceOptions): Observable<RemoteMessageEntry[]> =>
  new Observable(observer => {
    const unwatch = options.reachability.watch();
    const subscription = merge(of(undefined), options.reachability.wakeup$)
      .pipe(
        switchMap(() =>
          defer(options.query).pipe(
            catchError((error: unknown) => (isNetworkError(error) ? defer(options.local) : throwError(() => error)))
          )
        )
      )
      .subscribe(observer);
    return () => {
      subscription.unsubscribe();
      unwatch();
    };
  });

/**
 * 订阅远端目录实体，纯本地策略不获取网络监视资源。
 * @param rxdb - 已初始化的宿主数据库。
 * @returns 远端目录的响应式查询结果。
 */
export const observeRemoteMessages = (rxdb: RxDB): Observable<RemoteMessageEntry[]> => {
  const repository = rxdb.entityManager.getRepository(RemoteMessageEntry);
  const query = () => repository.findAll(QUERY);
  if (repository.sync.type !== SyncType.QueryCache) return query();
  return createRemoteCatalogSource({
    query,
    local: () => rxdb.localAdapterSync.getRepository(RemoteMessageEntry).find({ where: QUERY.where }),
    reachability: rxdb.reachability
  });
};
