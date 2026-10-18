import type { RxDB, TransactionExecutor, TransactionFun } from '@aiao/rxdb';
import { concat, defer, firstValueFrom, of, type Observable } from 'rxjs';
import { explodeBom } from './quantity/explosion-api.js';
import type { BomLocalAdapter } from './resolve/bom-adapter.js';
import { bomSqlDialectFor } from './resolve/bom-sql.js';
import { expandBom } from './resolve/expansion.js';
import { resolveViewAlternatives } from './view-alternatives.js';
import type { BomViewInput, BomViewSnapshot } from './view-types.js';

const scopedAdapter = (adapter: BomLocalAdapter, executor: TransactionExecutor): BomLocalAdapter => ({
  name: adapter.name,
  rxdb: adapter.rxdb,
  transaction: <T extends TransactionFun>(fun: T) => executor.run(fun) as Promise<Awaited<ReturnType<T>>>
});

/** 在单个读事务中取得结构、数量和显示信息，供查询及完整消费复用。 */
export const readBomViewSnapshot = async (db: RxDB, input: BomViewInput): Promise<BomViewSnapshot> => {
  const adapter = await firstValueFrom(db.localAdapter$);
  return adapter.transaction(async executor => {
    const scoped = scopedAdapter(adapter, executor);
    const dialect = bomSqlDialectFor(adapter.name);
    const expansion = await resolveViewAlternatives(
      executor,
      dialect,
      await expandBom(scoped, input.context, input.target, { budgets: input.budgets })
    );
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
    const ids = [
      ...new Set([
        ...expansion.nodes.map(node => node.itemId),
        ...(expansion.unresolved ?? []).flatMap(group =>
          group.candidates.flatMap(candidate => (candidate.childItemId === undefined ? [] : [candidate.childItemId]))
        ),
        ...(explosion?.unresolved ?? []).flatMap(group => group.candidates.map(candidate => candidate.itemId))
      ])
    ];
    const result = await executor.query(
      `SELECT "id", "itemNo", "description" FROM ${dialect.table('item')} WHERE "id" IN (${ids.map((_, index) => dialect.placeholder(index)).join(', ')}) ORDER BY "id"`,
      ids
    );
    const indexOf = (column: string) => result.columns.indexOf(column);
    const items = result.rows.map(row => ({
      id: String(row[indexOf('id')]),
      itemNo: String(row[indexOf('itemNo')]),
      description: row[indexOf('description')] == null ? null : String(row[indexOf('description')])
    }));
    return { expansion, explosion, quantityError, items, refreshing: false };
  }, false);
};

export const bomViewRunner = (db: RxDB, input: BomViewInput): Observable<BomViewSnapshot> => {
  let previous: BomViewSnapshot | undefined;
  const read = defer(async () => {
    const snapshot = await readBomViewSnapshot(db, input);
    previous = snapshot;
    return snapshot;
  });
  return defer(() => (previous === undefined ? read : concat(of({ ...previous, refreshing: true }), read)));
};
