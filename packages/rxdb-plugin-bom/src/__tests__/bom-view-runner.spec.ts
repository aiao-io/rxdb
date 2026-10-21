/** @fileoverview 活视图读取：物料显示信息分块、刷新合并与候选物料预取。 */

import type { RxDB, TransactionFun } from '@aiao/rxdb';
import { filter, firstValueFrom, ReplaySubject, timeout } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { BomHeader, BomItem, createBomView, type BomRepository } from '../index.js';
import { loadHistory } from '../resolve/history-loader.js';
import { BOM_VIEW_FIXTURE_DATES, loadBomViewFixture } from '../testing/bom-view-fixture.js';
import { deterministicId } from '../testing/scooter-dataset.js';
import type { BomViewInput, BomViewSnapshot, BomViewState } from '../view-types.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestAdapter } from './test-utils.js';

/** 视图物料显示信息查询的固定前缀；每次快照读取恰好执行一轮。 */
const VIEW_ITEMS_SQL = 'SELECT "id", "itemNo", "description" FROM';

/**
 * SQLite 3.32 之前的编译默认 `SQLITE_MAX_VARIABLE_NUMBER`，sqlite-core 也以它为保守上限。
 * 测试后端的真实上限更高（wa-sqlite 32766、PostgreSQL 协议 65535），这里按最保守的目标环境拦截。
 */
const LEGACY_SQLITE_MAX_VARIABLES = 999;

const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
};

/** 每轮连续发出的刷新请求数。 */
const BURST = 5;

/** 等计数在一个静默窗口内不再变化：夹具装载留下的变更事件派发完，计数基线才可信。 */
const untilQuiet = async (count: () => number): Promise<number> => {
  for (let last = count(), round = 0; round < 20; round += 1) {
    await delay(300);
    if (count() === last) return last;
    last = count();
  }
  throw new Error('视图读取持续发生，等不到静默窗口');
};

interface TransactionProbe {
  /** 语句执行前调用；抛错即模拟后端拒绝该语句。 */
  beforeQuery?: (params: readonly unknown[]) => void;
  /** 事务提交、串行队列已释放、结果交回调用方之前调用；`viewRead` 表示本事务执行过视图物料读取。 */
  afterCommit?: (viewRead: boolean) => Promise<void>;
}

/** 包住适配器事务入口（读写都经它排进同一串行队列），返回还原函数。 */
const probeTransactions = (adapter: BomTestAdapter, probe: TransactionProbe): (() => void) => {
  const transaction = adapter.transaction;
  adapter.transaction = async <Fun extends TransactionFun>(
    fun: Fun,
    transactionLog?: boolean
  ): Promise<Awaited<ReturnType<Fun>>> => {
    let viewRead = false;
    const result = (await transaction.call(
      adapter,
      async executor => {
        const query = executor.query;
        executor.query = (sql, params) => {
          probe.beforeQuery?.(params ?? []);
          if (sql.startsWith(VIEW_ITEMS_SQL)) viewRead = true;
          return query.call(executor, sql, params);
        };
        try {
          return await fun(executor);
        } finally {
          executor.query = query;
        }
      },
      transactionLog
    )) as Awaited<ReturnType<Fun>>;
    await probe.afterCommit?.(viewRead);
    return result;
  };
  return () => {
    adapter.transaction = transaction;
  };
};

const settledSnapshot = (
  snapshots: ReplaySubject<BomViewSnapshot>,
  predicate: (snapshot: BomViewSnapshot) => boolean = () => true
): Promise<BomViewSnapshot> =>
  firstValueFrom(
    snapshots.pipe(
      filter(snapshot => !snapshot.refreshing && predicate(snapshot)),
      timeout(20_000)
    )
  );

const WIDE_LEAVES = 1000;

/** 根下挂 1000 个不同叶子物料：视图要取显示信息的物料共 1001 个，超过保守绑定上限。 */
const loadWideBom = async (adapter: BomTestAdapter): Promise<{ input: BomViewInput; itemIds: string[] }> => {
  const stamp = new Date(BOM_VIEW_FIXTURE_DATES.baseline);
  const itemIds = Array.from({ length: WIDE_LEAVES + 1 }, (_, index) => deterministicId(`bom-view-wide:${index}`));
  await adapter.transaction(async executor => {
    for (const [index, id] of itemIds.entries()) {
      await executor
        .getRepository(BomItem)
        .create(
          adapter.rxdb.entityManager.instantiate(BomItem, { id, itemNo: `BOM-VIEW-WIDE-${index}` } as Partial<BomItem>)
        );
    }
  });
  await loadHistory(adapter, {
    batchNo: 'bom-view-wide',
    revisions: [{ itemId: itemIds[0], revisionNo: 'A', effectiveFrom: stamp }],
    headers: [
      {
        revisionIndex: 0,
        bomType: 'ebom',
        orgId: 'bom-view-wide',
        lines: itemIds.slice(1).map((childItemId, index) => ({
          lineNo: index + 1,
          occurrences: [{ childItemId, qty: '1', effectiveFrom: stamp }]
        }))
      }
    ]
  });
  return {
    itemIds,
    input: {
      context: { bomType: 'ebom', orgId: 'bom-view-wide', asOfDate: new Date(BOM_VIEW_FIXTURE_DATES.evaluation) },
      target: { parentItemId: itemIds[0] },
      plannedQty: { value: '1', uom: 'pcs' }
    }
  };
};

/**
 * 两遍遍历发散的最小结构：根下叶子、副产行在前，子装配在后，子装配的一条逻辑行按序列号分给 red / blue。
 * 两遍预算同一结算，发散来自节点集：副产行是展开节点、不是数量遍历的路径节点。paths=3 时展开连根收三个节点就截断、
 * 不进子装配；爆炸不为副产计预算，继续下钻并报告序列候选。
 */
const loadDivergentBom = async (db: RxDB): Promise<BomViewInput> => {
  const id = (key: string) => deterministicId(`bom-view-divergent:${key}`);
  const stamp = new Date(BOM_VIEW_FIXTURE_DATES.baseline);
  const keys = ['root', 'sub', 'leaf', 'byp', 'red', 'blue'] as const;
  for (const key of keys) {
    await db.entityManager
      .instantiate(BomItem, { id: id(`item:${key}`), itemNo: `BOM-VIEW-DIV-${key.toUpperCase()}` } as Partial<BomItem>)
      .save();
  }
  const occurrence = (
    child: (typeof keys)[number],
    extra: { unitFrom?: number; unitTo?: number; flowDirection?: 'by_product' } = {}
  ) => ({
    childItemId: id(`item:${child}`),
    qty: '1',
    effectiveFrom: stamp,
    ...extra
  });
  await db.bom.loadHistory({
    batchNo: 'bom-view-divergent',
    revisions: (['root', 'sub'] as const).map(key => ({
      itemId: id(`item:${key}`),
      revisionNo: 'A',
      effectiveFrom: stamp
    })),
    headers: [
      {
        revisionIndex: 0,
        bomType: 'ebom',
        orgId: 'bom-view-divergent',
        lines: [
          { lineNo: 10, occurrences: [occurrence('leaf')] },
          { lineNo: 15, occurrences: [occurrence('byp', { flowDirection: 'by_product' })] },
          { lineNo: 20, occurrences: [occurrence('sub')] }
        ]
      },
      {
        revisionIndex: 1,
        bomType: 'ebom',
        orgId: 'bom-view-divergent',
        lines: [
          { lineNo: 10, occurrences: [occurrence('leaf')] },
          { lineNo: 20, occurrences: [occurrence('red', { unitTo: 136 }), occurrence('blue', { unitFrom: 137 })] }
        ]
      }
    ]
  });
  return {
    context: { bomType: 'ebom', orgId: 'bom-view-divergent', asOfDate: new Date(BOM_VIEW_FIXTURE_DATES.evaluation) },
    target: { parentItemId: id('item:root') },
    plannedQty: { value: '1', uom: 'pcs' },
    budgets: { paths: 3 }
  };
};

for (const backend of ['wa-sqlite', 'pglite'] as const) {
  describe(`BOM 活视图读取 [${backend}]`, () => {
    it('不同物料超过保守绑定上限时物料信息分块读取，快照完整且按 id 排序', async () => {
      const adapter = await createBomTestAdapter(backend);
      let restore: () => void = () => undefined;
      try {
        const { input, itemIds } = await loadWideBom(adapter);
        restore = probeTransactions(adapter, {
          beforeQuery: params => {
            if (params.length > LEGACY_SQLITE_MAX_VARIABLES) throw new Error('too many SQL variables');
          }
        });
        const snapshots = new ReplaySubject<BomViewSnapshot>(1);
        const subscription = adapter.rxdb.bom.watchView(input).subscribe(snapshots);
        try {
          const snapshot = await settledSnapshot(snapshots);
          expect(snapshot.expansion.nodes).toHaveLength(WIDE_LEAVES + 1);
          expect(snapshot.items.map(item => item.id)).toEqual([...itemIds].sort());
          expect(snapshot.items.find(item => item.id === itemIds[WIDE_LEAVES])?.itemNo).toBe(
            `BOM-VIEW-WIDE-${WIDE_LEAVES}`
          );
        } finally {
          subscription.unsubscribe();
        }
      } finally {
        restore();
        await disposeBomTestAdapter(adapter);
      }
    }, 60_000);

    it('读取开始前的刷新并入同一次读取，读取在途时的刷新只追加一次尾随重读', async () => {
      const adapter = await createBomTestAdapter(backend);
      let restore: () => void = () => undefined;
      try {
        const fixture = await loadBomViewFixture(adapter.rxdb);
        let viewReads = 0;
        restore = probeTransactions(adapter, {
          afterCommit: async viewRead => {
            if (viewRead) viewReads += 1;
          }
        });
        const repository = adapter.rxdb.entityManager.getRepository<typeof BomHeader, BomRepository<typeof BomHeader>>(
          BomHeader
        );
        const snapshots = new ReplaySubject<BomViewSnapshot>(1);
        const subscription = adapter.rxdb.bom.watchView(fixture.input).subscribe(snapshots);
        try {
          await settledSnapshot(snapshots);
          const before = await untilQuiet(() => viewReads);
          // 占住串行队列：此后发起的视图读取都停在队列里，保持在途
          const held = deferred();
          const gate = deferred();
          const blocker = adapter.transaction(async () => {
            held.resolve();
            await gate.promise;
          }, false);
          await held.promise;
          for (let index = 0; index < BURST; index += 1) repository.refreshView(fixture.input);
          await delay(50);
          for (let index = 0; index < BURST; index += 1) repository.refreshView(fixture.input);
          gate.resolve();
          await blocker;
          await settledSnapshot(snapshots);
          await delay(300);
          expect(viewReads - before).toBe(2);
        } finally {
          subscription.unsubscribe();
        }
      } finally {
        restore();
        await disposeBomTestAdapter(adapter);
      }
    });

    it('读取在途时逐条独立事务写入不逐次重建，最终快照反映全部写入', async () => {
      const adapter = await createBomTestAdapter(backend);
      let restore: () => void = () => undefined;
      try {
        const fixture = await loadBomViewFixture(adapter.rxdb);
        const keys = ['main', 'assembly', 'resistor', 'wire', 'phantom'] as const;
        const items = await Promise.all(
          keys.map(key => firstValueFrom(adapter.rxdb.entityManager.getRepository(BomItem).get(fixture.ids.items[key])))
        );
        let slow = false;
        let viewReads = 0;
        restore = probeTransactions(adapter, {
          // 读取的耗时放在释放队列之后：读取对视图仍在途，写入照常提交、逐条派发变更事件
          afterCommit: async viewRead => {
            if (!viewRead) return;
            viewReads += 1;
            if (slow) await delay(400);
          }
        });
        const snapshots = new ReplaySubject<BomViewSnapshot>(1);
        const subscription = adapter.rxdb.bom.watchView(fixture.input).subscribe(snapshots);
        try {
          await settledSnapshot(snapshots);
          const before = await untilQuiet(() => viewReads);
          slow = true;
          for (const [index, item] of items.entries()) {
            item.description = `批量-${index}`;
            await item.save();
            await delay(30);
          }
          await settledSnapshot(snapshots, snapshot =>
            keys.every(
              (key, index) =>
                snapshot.items.find(item => item.id === fixture.ids.items[key])?.description === `批量-${index}`
            )
          );
          await delay(600);
          expect(viewReads - before).toBeLessThanOrEqual(2);
        } finally {
          subscription.unsubscribe();
        }
      } finally {
        restore();
        await disposeBomTestAdapter(adapter);
      }
    });

    it('爆炸越过展开截断报告的序列候选也有物料标签', async () => {
      const adapter = await createBomTestAdapter(backend);
      try {
        const view = createBomView(adapter.rxdb, await loadDivergentBom(adapter.rxdb));
        const states = new ReplaySubject<BomViewState>(1);
        const subscription = view.state$.subscribe(states);
        try {
          const state = await firstValueFrom(
            states.pipe(
              filter(value => value.phase === 'success' && !value.refreshing),
              timeout(20_000)
            )
          );
          expect(state.truncated?.reason).toBe('paths');
          expect(state.nodes.map(node => node.itemNo)).toEqual([
            'BOM-VIEW-DIV-ROOT',
            'BOM-VIEW-DIV-LEAF',
            'BOM-VIEW-DIV-BYP'
          ]);
          expect(state.unresolved.map(group => group.kind)).toEqual(['unit']);
          expect(state.unresolved[0].candidates.map(candidate => candidate.label).sort()).toEqual([
            'BOM-VIEW-DIV-BLUE',
            'BOM-VIEW-DIV-RED'
          ]);
        } finally {
          subscription.unsubscribe();
          view.destroy();
        }
      } finally {
        await disposeBomTestAdapter(adapter);
      }
    });
  });
}
