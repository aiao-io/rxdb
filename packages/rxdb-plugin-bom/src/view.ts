import type { RxDB } from '@aiao/rxdb';
import { concat, defer, firstValueFrom, from, of, type Observable } from 'rxjs';
import { explodeBom } from './quantity/explosion-api.js';
import { scopedBomAdapter } from './resolve/bom-adapter.js';
import { bomSqlDialectFor } from './resolve/bom-sql.js';
import { expandBom } from './resolve/expansion-api.js';
import { viewItemIds } from './view-projection.js';
import type { BomViewInput, BomViewSnapshot } from './view-types.js';

/** 在单个读事务中取得结构、数量和显示信息，供查询及完整消费复用。 */
export const readBomViewSnapshot = async (db: RxDB, input: BomViewInput): Promise<BomViewSnapshot> => {
  const adapter = await firstValueFrom(db.localAdapter$);
  return adapter.transaction(async executor => {
    const scoped = scopedBomAdapter(adapter, executor);
    const expansion = await expandBom(scoped, input.context, input.target, { budgets: input.budgets });
    let explosion: BomViewSnapshot['explosion'] = null;
    let quantityError: unknown = null;
    try {
      explosion = await explodeBom(scoped, input.context, input.target, {
        plannedQty: input.plannedQty,
        budgets: input.budgets,
        params: input.params
      });
    } catch (error) {
      quantityError = error;
    }
    const { readBomViewItems } = await import('./view-items.js');
    const items = await readBomViewItems(
      executor,
      bomSqlDialectFor(adapter.name),
      viewItemIds({ expansion, explosion })
    );
    return { expansion, explosion, quantityError, items, refreshing: false };
  }, false);
};

const ignore = (): void => undefined;

/**
 * 活视图任务的读取调度：同一任务的读取串行，读取进行中到达的刷新共享一次尾随读取。
 *
 * @remarks
 * 合并钩子逢实体变更即 refresh，QueryTask 的 switchMap 只退订旧订阅、停不下已开始的读事务；
 * 不合并时批量写入就是同样多轮完整重建。尾随读在当前读结束后才开始，因此每个刷新请求之后
 * 都有一次在它之后开始的读取，不丢更新。
 */
export const bomViewRunner = (db: RxDB, input: BomViewInput): Observable<BomViewSnapshot> => {
  let previous: BomViewSnapshot | undefined;
  let pending: Promise<BomViewSnapshot> | null = null;
  let settled: Promise<void> = Promise.resolve();
  const request = (): Promise<BomViewSnapshot> => {
    if (pending !== null) return pending;
    const read = settled.then(async () => {
      pending = null;
      const snapshot = await readBomViewSnapshot(db, input);
      previous = snapshot;
      return snapshot;
    });
    pending = read;
    // 只用于排队：失败照常经 read 交给订阅方
    settled = read.then(ignore, ignore);
    return read;
  };
  return defer(() => {
    const read = from(request());
    return previous === undefined ? read : concat(of({ ...previous, refreshing: true }), read);
  });
};
