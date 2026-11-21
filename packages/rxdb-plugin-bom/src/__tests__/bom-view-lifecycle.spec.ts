import type { QueryManager, RxDB } from '@aiao/rxdb';
import {
  filter,
  firstValueFrom,
  from,
  Observable,
  ReplaySubject,
  Subject,
  throwError,
  timeout,
  type Subscriber
} from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { BomHeader, createBomView, type BomRepository } from '../index.js';
import { loadBomViewFixture, type BomViewFixture } from '../testing/bom-view-fixture.js';
import type { BomViewHandle, BomViewInput, BomViewSnapshot, BomViewState } from '../view-types.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestBackend } from './test-utils.js';

const withFixture = async (
  backend: BomTestBackend,
  run: (db: RxDB, fixture: BomViewFixture) => Promise<void>
): Promise<void> => {
  const adapter = await createBomTestAdapter(backend);
  try {
    await run(adapter.rxdb, await loadBomViewFixture(adapter.rxdb));
  } finally {
    vi.restoreAllMocks();
    await disposeBomTestAdapter(adapter);
  }
};

const observe = (view: BomViewHandle) => {
  const values: BomViewState[] = [];
  const changes = new ReplaySubject<BomViewState>(1);
  let completed = false;
  const subscription = view.state$.subscribe({
    next(state) {
      values.push(state);
      changes.next(state);
    },
    error: (cause: unknown) => changes.error(cause),
    complete() {
      completed = true;
      changes.complete();
    }
  });
  return {
    values,
    get completed() {
      return completed;
    },
    until: (predicate: (state: BomViewState) => boolean) =>
      firstValueFrom(changes.pipe(filter(predicate), timeout(10_000))),
    stop: () => subscription.unsubscribe()
  };
};

const ready = (recorded: ReturnType<typeof observe>) =>
  recorded.until(state => state.phase === 'success' && !state.refreshing);

const showRoot = async (view: BomViewHandle, recorded: ReturnType<typeof observe>) => {
  const state = await ready(recorded);
  if (state.nodes.find(node => node.depth === 0)?.expanded !== true) view.toggle([]);
  return recorded.until(state => state.nodes.some(node => node.depth === 1));
};

const snapshotOf = (db: RxDB, input: BomViewInput): Promise<BomViewSnapshot> =>
  firstValueFrom(
    db.bom.watchView(input).pipe(
      filter(snapshot => !snapshot.refreshing),
      timeout(10_000)
    )
  );

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
};

for (const backend of ['wa-sqlite', 'pglite'] as const) {
  describe(`BOM 共享视图生命周期 [${backend}]`, () => {
    it('初始加载、后台刷新、错误重试与空结果可观察，刷新保留已有节点', async () => {
      await withFixture(backend, async (db, fixture) => {
        const snapshot = await snapshotOf(db, fixture.input);
        const source = new Subject<BomViewSnapshot>();
        const retry = new Subject<BomViewSnapshot>();
        const watch = vi.spyOn(db.bom, 'watchView').mockReturnValue(source);
        const view = createBomView(db, fixture.input);
        const recorded = observe(view);
        try {
          expect(recorded.values.some(state => state.phase === 'loading')).toBe(true);
          source.next(snapshot);
          const before = await ready(recorded);
          source.next({ ...snapshot, refreshing: true });
          const refreshing = await recorded.until(state => state.refreshing);
          expect(refreshing.nodes).toEqual(before.nodes);
          const failure = new Error('受控后台读取失败');
          source.error(failure);
          const failed = await recorded.until(state => state.phase === 'error');
          expect(failed.error).toBe(failure);
          expect(failed.nodes).toEqual(before.nodes);
          watch.mockReturnValue(retry);
          view.refresh();
          retry.next(snapshot);
          expect((await ready(recorded)).error).toBeNull();
          retry.next({
            ...snapshot,
            expansion: { ...snapshot.expansion, nodes: [] },
            explosion: null,
            quantityError: null
          });
          expect((await recorded.until(state => state.phase === 'empty')).nodes).toEqual([]);
        } finally {
          view.destroy();
        }
      });
    });

    it('同库 handle 的折叠独立，销毁一份后另一份和重新创建的视图继续刷新', async () => {
      await withFixture(backend, async (db, fixture) => {
        const first = createBomView(db, fixture.input);
        const second = createBomView(db, fixture.input);
        const firstStates = observe(first);
        const secondStates = observe(second);
        let recreated: BomViewHandle | undefined;
        try {
          await showRoot(first, firstStates);
          await showRoot(second, secondStates);
          const path = [fixture.ids.occurrences.shared1];
          first.toggle(path);
          await firstStates.until(state => state.nodes.some(node => node.depth === 2));
          expect((await ready(secondStates)).nodes.some(node => node.depth === 2)).toBe(false);
          expect((await ready(secondStates)).nodes.find(node => node.path[0] === path[0])?.expanded).toBe(false);
          first.destroy();
          expect(firstStates.completed).toBe(true);
          const stoppedCount = firstStates.values.length;
          await fixture.actions.publishPendingEcn();
          await secondStates.until(
            state =>
              !state.refreshing &&
              state.nodes.some(
                node => node.occurrenceId === fixture.ids.occurrences.pending && node.quantity?.value === '5'
              )
          );
          expect(firstStates.values).toHaveLength(stoppedCount);
          recreated = createBomView(db, fixture.input);
          const recreatedStates = observe(recreated);
          const state = await showRoot(recreated, recreatedStates);
          expect(state.nodes.some(node => node.occurrenceId === fixture.ids.occurrences.pending)).toBe(true);
          expect(state.nodes.some(node => node.depth === 2)).toBe(false);
        } finally {
          first.destroy();
          second.destroy();
          recreated?.destroy();
        }
      });
    });

    it('同库共享数据任务时显式 refresh 仍重新读取，并通知另一份活视图', async () => {
      await withFixture(backend, async (db, fixture) => {
        const manager = Reflect.get(db.entityManager.getRepository(BomHeader), 'queryManager') as QueryManager<
          typeof BomHeader
        >;
        manager.registerMergeCreateFn('bomView', () => undefined);
        manager.registerMergeUpdateFn('bomView', () => undefined);
        manager.registerMergeRemoveFn('bomView', () => undefined);
        const first = createBomView(db, fixture.input);
        const second = createBomView(db, fixture.input);
        const firstStates = observe(first);
        const secondStates = observe(second);
        try {
          await ready(firstStates);
          await ready(secondStates);
          const count = secondStates.values.length;
          first.refresh();
          await secondStates.until(
            state => secondStates.values.length > count && state.phase === 'success' && !state.refreshing
          );
          expect(secondStates.values.slice(count).some(state => state.refreshing)).toBe(true);
        } finally {
          first.destroy();
          second.destroy();
        }
      });
    });

    it('显式 refresh：源正常时只让共享任务重读一次，源失败后才重订阅', async () => {
      await withFixture(backend, async (db, fixture) => {
        const repository = db.entityManager.getRepository<typeof BomHeader, BomRepository<typeof BomHeader>>(BomHeader);
        const refreshView = vi.spyOn(repository, 'refreshView');
        const watch = vi.spyOn(db.bom, 'watchView');
        const view = createBomView(db, fixture.input);
        const recorded = observe(view);
        try {
          await ready(recorded);
          const count = recorded.values.length;
          view.refresh();
          await recorded.until(
            state => recorded.values.length > count && state.phase === 'success' && !state.refreshing
          );
          expect(recorded.values.slice(count).some(state => state.refreshing)).toBe(true);
          expect(watch).toHaveBeenCalledOnce();
          expect(refreshView).toHaveBeenCalledOnce();
          watch.mockReturnValueOnce(throwError(() => new Error('受控读取失败')));
          view.setInput(fixture.inputFor('main', { plannedQty: { value: '2', uom: 'pcs' } }));
          await recorded.until(state => state.phase === 'error');
          view.refresh();
          await recorded.until(state => state.phase === 'success' && !state.refreshing && state.error === null);
          expect(watch).toHaveBeenCalledTimes(3);
          expect(refreshView).toHaveBeenCalledOnce();
        } finally {
          recorded.stop();
          view.destroy();
        }
      });
    });

    it('calculate 期间替换输入时明确拒绝旧结果，新输入可重新计算', async () => {
      await withFixture(backend, async (db, fixture) => {
        const view = createBomView(db, fixture.input);
        const recorded = observe(view);
        try {
          await ready(recorded);
          const stale = view.calculate();
          view.setInput(fixture.inputFor('formula'));
          await expect(stale).rejects.toThrow(/输入已替换/);
          await expect(view.calculate()).resolves.toMatchObject({
            manifest: { parentItemId: fixture.ids.items.formula }
          });
        } finally {
          recorded.stop();
          view.destroy();
        }
      });
    });

    it('相同实体 ID 的两个数据库不串视图，更新第一库显示值不覆盖第二库', async () => {
      await withFixture(backend, async (firstDb, firstFixture) => {
        await withFixture(backend, async (secondDb, secondFixture) => {
          expect(firstFixture.ids.items.main).toBe(secondFixture.ids.items.main);
          const first = createBomView(firstDb, firstFixture.input);
          const second = createBomView(secondDb, secondFixture.input);
          const firstStates = observe(first);
          const secondStates = observe(second);
          try {
            await showRoot(first, firstStates);
            await showRoot(second, secondStates);
            await firstFixture.actions.setDescription('resistor', '只属于第一库');
            await firstStates.until(state => state.nodes.some(node => node.description === '只属于第一库'));
            second.refresh();
            const after = await ready(secondStates);
            expect(
              after.nodes
                .filter(node => node.itemId === secondFixture.ids.items.resistor)
                .every(node => node.description === 'resistor')
            ).toBe(true);
          } finally {
            first.destroy();
            second.destroy();
          }
        });
      });
    });

    it('连续替换完整输入后，旧输入的迟到结果不能覆盖最新数量和目标', async () => {
      await withFixture(backend, async (db, fixture) => {
        const formulaInput = fixture.inputFor('formula', {
          plannedQty: { value: '5', uom: 'pcs' },
          params: { factor: '3' }
        });
        const [oldSnapshot, nextSnapshot] = await Promise.all([
          snapshotOf(db, fixture.input),
          snapshotOf(db, formulaInput)
        ]);
        const old = deferred<BomViewSnapshot>();
        const next = deferred<BomViewSnapshot>();
        vi.spyOn(db.bom, 'watchView').mockImplementation(input =>
          from(input.target.parentItemId === fixture.ids.items.formula ? next.promise : old.promise)
        );
        const view = createBomView(db, fixture.input);
        const recorded = observe(view);
        try {
          view.setInput(fixture.inputFor('main', { plannedQty: { value: '2', uom: 'pcs' } }));
          view.setInput(formulaInput);
          next.resolve(nextSnapshot);
          const latest = await showRoot(view, recorded);
          expect(latest.nodes.find(node => node.depth === 0)?.itemId).toBe(fixture.ids.items.formula);
          expect(
            latest.nodes.find(node => node.occurrenceId === fixture.ids.occurrences.formula)?.quantity?.value
          ).toBe('30');
          old.resolve(oldSnapshot);
          await old.promise;
          await Promise.resolve();
          const after = await ready(recorded);
          expect(after.nodes.find(node => node.depth === 0)?.itemId).toBe(fixture.ids.items.formula);
          expect(after.nodes.find(node => node.occurrenceId === fixture.ids.occurrences.formula)?.quantity?.value).toBe(
            '30'
          );
        } finally {
          view.destroy();
        }
      });
    });

    it('无效评估日成为可恢复的领域错误状态，不从订阅或refresh同步抛出', async () => {
      await withFixture(backend, async (db, fixture) => {
        const view = createBomView(db, fixture.inputFor('main', { context: { asOfDate: new Date(NaN) } }));
        const recorded = observe(view);
        try {
          const failed = await recorded.until(state => state.phase === 'error');
          expect(failed.error).toHaveProperty('message', expect.stringContaining('asOfDate'));
          expect(() => view.refresh()).not.toThrow();
          view.setInput(fixture.input);
          expect((await ready(recorded)).error).toBeNull();
        } finally {
          recorded.stop();
          view.destroy();
        }
      });
    });

    it('同一 handle 共享订阅，最后订阅释放后可重新订阅，destroy 幂等且终止后续订阅', async () => {
      await withFixture(backend, async (db, fixture) => {
        const snapshot = await snapshotOf(db, fixture.input);
        const subscribers: Subscriber<BomViewSnapshot>[] = [];
        let active = 0;
        vi.spyOn(db.bom, 'watchView').mockImplementation(
          () =>
            new Observable(subscriber => {
              active += 1;
              subscribers.push(subscriber);
              subscriber.next(snapshot);
              return () => {
                active -= 1;
              };
            })
        );
        const view = createBomView(db, fixture.input);
        const first = observe(view);
        const second = observe(view);
        try {
          await ready(first);
          await ready(second);
          expect(active).toBe(1);
          first.stop();
          expect(active).toBe(1);
          second.stop();
          expect(active).toBe(0);
          const third = observe(view);
          await ready(third);
          expect(active).toBe(1);
          view.destroy();
          view.destroy();
          expect(active).toBe(0);
          expect(third.completed).toBe(true);
          const count = third.values.length;
          for (const subscriber of subscribers) subscriber.next(snapshot);
          expect(third.values).toHaveLength(count);
          const afterDestroy = observe(view);
          expect(afterDestroy.completed).toBe(true);
        } finally {
          first.stop();
          second.stop();
          view.destroy();
        }
      });
    });
  });
}
