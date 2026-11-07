import type { RxDB, UUID } from '@aiao/rxdb';
import { filter, firstValueFrom, ReplaySubject, timeout } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { BomEcn, BomHeader, BomLineOccurrence, BomRouting } from '../entities.js';
import { createBomView, initialBomViewState } from '../index.js';
import { BOM_VIEW_FIXTURE_DATES, loadBomViewFixture, type BomViewFixture } from '../testing/bom-view-fixture.js';
import { BomCycleError, BomWriteProtocolError } from '../types.js';
import type { BomViewHandle, BomViewState } from '../view-types.js';
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
  const changes = new ReplaySubject<BomViewState>(1);
  const subscription = view.state$.subscribe({
    next: value => changes.next(value),
    error: (cause: unknown) => changes.error(cause)
  });
  return {
    until: (predicate: (state: BomViewState) => boolean) =>
      firstValueFrom(changes.pipe(filter(predicate), timeout(10_000))),
    stop: () => subscription.unsubscribe()
  };
};

const readOccurrence = (db: RxDB, id: UUID) =>
  firstValueFrom(db.entityManager.getRepository(BomLineOccurrence).get(id));

const ecns = (db: RxDB) =>
  firstValueFrom(
    db.entityManager.getRepository(BomEcn).find({
      where: { combinator: 'and', rules: [] }
    })
  );

const publishDraftHeader = async (db: RxDB, fixture: BomViewFixture): Promise<void> => {
  const header = await firstValueFrom(db.entityManager.getRepository(BomHeader).get(fixture.ids.headers.draft));
  header.state = 'released';
  await header.save();
};

const failureOf = (operation: Promise<unknown>): Promise<unknown> =>
  operation.then(
    () => null,
    (cause: unknown) => cause
  );

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
};

/** 让发生项仓储的 update 停在落库之前，直到 release；reached 在保存读完旧值、即将写入时兑现。 */
const holdOccurrenceUpdate = (db: RxDB) => {
  const repository = db.entityManager.getRepository(BomLineOccurrence);
  const update = repository.update.bind(repository);
  const reached = deferred();
  const gate = deferred();
  vi.spyOn(repository, 'update').mockImplementation(async (entity, patch) => {
    reached.resolve();
    await gate.promise;
    return update(entity, patch);
  });
  return { reached: reached.promise, release: gate.resolve };
};

for (const backend of ['wa-sqlite', 'pglite'] as const) {
  describe(`BOM 共享发生项编辑 [${backend}]`, () => {
    it('独立加载草稿并保存用量、损耗、工序、生效期，真实发布后由数量 kernel 消费', async () => {
      await withFixture(backend, async (db, fixture) => {
        const view = createBomView(db, fixture.input);
        const recorded = observe(view);
        try {
          await view.loadOccurrence(fixture.ids.occurrences.draft);
          const loaded = await recorded.until(state => state.editor.phase === 'success');
          expect(loaded.nodes.some(node => node.occurrenceId === fixture.ids.occurrences.draft)).toBe(false);
          expect(loaded.editor.value).toMatchObject({
            occurrenceId: fixture.ids.occurrences.draft,
            editable: true,
            readOnlyReason: null
          });
          const effectiveFrom = new Date('2050-01-01T00:00:00.000Z');
          const effectiveTo = new Date(BOM_VIEW_FIXTURE_DATES.future);
          await view.saveOccurrence({
            qty: '10.0',
            componentScrap: '0.10',
            operationSeq: 20,
            effectiveFrom,
            effectiveTo
          });
          expect(await readOccurrence(db, fixture.ids.occurrences.draft)).toMatchObject({
            qty: '10',
            componentScrap: '0.1',
            operationSeq: 20,
            effectiveFrom,
            effectiveTo
          });
          const saved = await recorded.until(state => !state.editor.saving && state.editor.value?.qty === '10');
          expect(saved.editor.error).toBeNull();
          expect((await ecns(db)).map(ecn => ecn.id)).toEqual([fixture.ids.pendingEcn]);
          const header = await firstValueFrom(db.entityManager.getRepository(BomHeader).get(fixture.ids.headers.draft));
          expect(header.state).toBe('draft');
          await publishDraftHeader(db, fixture);
          view.setInput(fixture.inputFor('draft'));
          await recorded.until(
            state =>
              state.phase === 'success' &&
              !state.refreshing &&
              state.nodes.find(node => node.depth === 0)?.itemId === fixture.ids.items.draft
          );
          const quantity = await view.calculate();
          expect(quantity.requirementLines).toMatchObject([
            {
              qty: '11',
              uom: 'pcs',
              steps: {
                componentScrapped: { value: '11', uom: 'pcs' },
                operationScrapped: { value: '11', uom: 'pcs' }
              }
            }
          ]);
          view.setInput(fixture.inputFor('draft', { context: { asOfDate: new Date('2049-12-31T00:00:00.000Z') } }));
          const invisible = await recorded.until(state => !state.refreshing && state.phase !== 'loading');
          expect(invisible.phase).toBe('empty');
          expect(invisible.nodes).toEqual([]);
          const before = await db.bom.expandBom(
            {
              ...fixture.input.context,
              asOfDate: new Date('2049-12-31T00:00:00.000Z')
            },
            fixture.inputFor('draft').target
          );
          const after = await db.bom.expandBom(
            {
              ...fixture.input.context,
              asOfDate: effectiveTo
            },
            fixture.inputFor('draft').target
          );
          expect(before.nodes.some(node => node.occurrenceId === fixture.ids.occurrences.draft)).toBe(false);
          expect(after.nodes.some(node => node.occurrenceId === fixture.ids.occurrences.draft)).toBe(false);
        } finally {
          recorded.stop();
          view.destroy();
        }
      });
    });

    it('已发布头下 draft ECN 的新发生项可改，保存不自动发布，真实发布后数量更新', async () => {
      await withFixture(backend, async (db, fixture) => {
        const view = createBomView(db, fixture.input);
        const recorded = observe(view);
        try {
          await view.loadOccurrence(fixture.ids.occurrences.pending);
          const loaded = await recorded.until(state => state.editor.phase === 'success');
          expect(loaded.editor.value?.editable).toBe(true);
          await view.saveOccurrence({ qty: '7', componentScrap: '0.1', operationSeq: 20 });
          expect(await readOccurrence(db, fixture.ids.occurrences.pending)).toMatchObject({
            qty: '7',
            componentScrap: '0.1',
            operationSeq: 20
          });
          expect((await ecns(db)).map(ecn => [ecn.id, ecn.state])).toEqual([[fixture.ids.pendingEcn, 'draft']]);
          expect(
            (await view.calculate()).requirementLines.some(line => line.path.includes(fixture.ids.occurrences.pending))
          ).toBe(false);
          await fixture.actions.publishPendingEcn();
          view.refresh();
          await recorded.until(state => !state.refreshing && state.phase === 'success');
          const quantity = await view.calculate();
          expect(
            quantity.requirementLines.find(line => line.path.includes(fixture.ids.occurrences.pending))
          ).toMatchObject({ qty: '8', steps: { operationScrapped: { value: '7.7', uom: 'pcs' } } });
          await view.loadOccurrence(fixture.ids.occurrences.pending);
          expect((await recorded.until(state => state.editor.phase === 'success')).editor.value).toMatchObject({
            editable: false,
            readOnlyReason: expect.any(String)
          });
        } finally {
          recorded.stop();
          view.destroy();
        }
      });
    });

    it('已发布既有发生项只读，保存拒绝且不修改数据或创建 ECN', async () => {
      await withFixture(backend, async (db, fixture) => {
        const view = createBomView(db, fixture.input);
        const recorded = observe(view);
        try {
          await view.loadOccurrence(fixture.ids.occurrences.repeat1);
          const loaded = await recorded.until(state => state.editor.phase === 'success');
          expect(loaded.editor.value).toMatchObject({ editable: false, readOnlyReason: expect.any(String) });
          expect(loaded.editor.value?.readOnlyReason?.length).toBeGreaterThan(0);
          const failure = await failureOf(view.saveOccurrence({ qty: '99' }));
          expect(failure).toBeInstanceOf(BomWriteProtocolError);
          const failed = await recorded.until(state => state.editor.error !== null);
          expect(failed.editor.error).toBe(failure);
          expect((await readOccurrence(db, fixture.ids.occurrences.repeat1)).qty).toBe('1');
          expect((await ecns(db)).map(ecn => ecn.id)).toEqual([fixture.ids.pendingEcn]);
        } finally {
          recorded.stop();
          view.destroy();
        }
      });
    });

    it('真实成环错误经保存原样上抛，编辑器保留 code、payload、message 与原编辑值', async () => {
      await withFixture(backend, async (db, fixture) => {
        const cycle = await failureOf(fixture.actions.createCycleOccurrence());
        expect(cycle).toBeInstanceOf(BomCycleError);
        expect(cycle).toHaveProperty('code', expect.any(String));
        expect(cycle).toHaveProperty('payload', expect.anything());
        const view = createBomView(db, fixture.input);
        const recorded = observe(view);
        try {
          await view.loadOccurrence(fixture.ids.occurrences.draft);
          const before = await recorded.until(state => state.editor.phase === 'success');
          vi.spyOn(db.entityManager.getRepository(BomLineOccurrence), 'update').mockRejectedValueOnce(cycle);
          const failure = await failureOf(view.saveOccurrence({ qty: '13' }));
          expect(failure).toBe(cycle);
          const after = await recorded.until(state => state.editor.error !== null);
          expect(after.editor.error).toBe(cycle);
          expect(after.editor.value).toEqual(before.editor.value);
          expect((await readOccurrence(db, fixture.ids.occurrences.draft)).qty).toBe('2');
        } finally {
          recorded.stop();
          view.destroy();
        }
      });
    });

    it('路线停用后仍可浏览结构，完整计算点名路线与发生项并拒绝，历史数量保留', async () => {
      await withFixture(backend, async (db, fixture) => {
        const draft = await readOccurrence(db, fixture.ids.occurrences.draft);
        draft.operationSeq = 20;
        await draft.save();
        const routing = await firstValueFrom(db.entityManager.getRepository(BomRouting).get(fixture.ids.draftRouting));
        routing.disabledAt = new Date(BOM_VIEW_FIXTURE_DATES.evaluation);
        await routing.save();
        await publishDraftHeader(db, fixture);
        const input = fixture.inputFor('draft');
        const view = createBomView(db, input);
        const recorded = observe(view);
        try {
          const state = await recorded.until(state => state.phase === 'success' && !state.refreshing);
          expect(state.quantityError).toBeInstanceOf(Error);
          const failure = await failureOf(view.calculate());
          expect(failure).toBeInstanceOf(Error);
          expect(failure).toHaveProperty('message', expect.stringContaining(fixture.ids.draftRouting));
          expect(failure).toHaveProperty('message', expect.stringContaining(fixture.ids.occurrences.draft));
          await view.loadOccurrence(fixture.ids.occurrences.draft);
          expect((await recorded.until(state => state.editor.phase === 'success')).editor.value?.editable).toBe(false);
          const historical = await db.bom.explodeBom(
            {
              ...input.context,
              asOfDate: new Date('2098-12-31T00:00:00.000Z')
            },
            input.target,
            { plannedQty: input.plannedQty }
          );
          expect(historical.requirementLines).toMatchObject([{ qty: '2' }]);
        } finally {
          recorded.stop();
          view.destroy();
        }
      });
    });

    it('保存未落库时发起的加载等保存结束再读，后发加载仍覆盖先发加载', async () => {
      await withFixture(backend, async (db, fixture) => {
        const view = createBomView(db, fixture.input);
        const recorded = observe(view);
        try {
          await view.loadOccurrence(fixture.ids.occurrences.draft);
          const held = holdOccurrenceUpdate(db);
          const saving = view.saveOccurrence({ qty: '13' });
          await held.reached;
          const loads = Promise.all([
            view.loadOccurrence(fixture.ids.occurrences.pending),
            view.loadOccurrence(fixture.ids.occurrences.draft)
          ]);
          // 加载不能抢在保存落库前读到旧值
          const first = await Promise.race([
            loads.then(() => 'loaded'),
            new Promise(done => setTimeout(done, 200, 'waiting'))
          ]);
          expect(first).toBe('waiting');
          held.release();
          await Promise.all([saving, loads]);
          expect((await readOccurrence(db, fixture.ids.occurrences.draft)).qty).toBe('13');
          const settled = await recorded.until(state => state.editor.phase === 'success' && !state.editor.saving);
          expect(settled.editor.value).toMatchObject({ occurrenceId: fixture.ids.occurrences.draft, qty: '13' });
          expect(settled.editor.error).toBeNull();
        } finally {
          recorded.stop();
          view.destroy();
        }
      });
    });

    it('同一目标只改参数保留编辑器；换目标回到初态，在途加载与保存的结果作废但写入照常落库', async () => {
      await withFixture(backend, async (db, fixture) => {
        const view = createBomView(db, fixture.input);
        const recorded = observe(view);
        try {
          await view.loadOccurrence(fixture.ids.occurrences.draft);
          view.setInput(fixture.inputFor('main', { plannedQty: { value: '2', uom: 'pcs' } }));
          const retained = await recorded.until(state => state.phase === 'success' && !state.refreshing);
          expect(retained.editor).toMatchObject({
            phase: 'success',
            value: { occurrenceId: fixture.ids.occurrences.draft }
          });
          view.setInput(fixture.inputFor('formula'));
          expect((await recorded.until(state => state.phase === 'success' && !state.refreshing)).editor).toEqual(
            initialBomViewState().editor
          );

          const lateLoad = view.loadOccurrence(fixture.ids.occurrences.pending);
          view.setInput(fixture.inputFor('main'));
          await lateLoad;
          expect((await recorded.until(state => state.phase === 'success' && !state.refreshing)).editor).toEqual(
            initialBomViewState().editor
          );

          await view.loadOccurrence(fixture.ids.occurrences.draft);
          const lateSave = view.saveOccurrence({ qty: '17' });
          view.setInput(fixture.inputFor('formula'));
          await lateSave;
          expect((await readOccurrence(db, fixture.ids.occurrences.draft)).qty).toBe('17');
          const after = await recorded.until(state => state.phase === 'success' && !state.refreshing);
          expect(after.editor).toEqual(initialBomViewState().editor);
        } finally {
          recorded.stop();
          view.destroy();
        }
      });
    });

    it('另一数据库连接后保存仍只写显式数据库，稳定 ID 不会导致跨库改量', async () => {
      await withFixture(backend, async (firstDb, firstFixture) => {
        await withFixture(backend, async (secondDb, secondFixture) => {
          const view = createBomView(firstDb, firstFixture.input);
          const recorded = observe(view);
          try {
            await view.loadOccurrence(firstFixture.ids.occurrences.draft);
            await view.saveOccurrence({ qty: '17' });
            expect((await readOccurrence(firstDb, firstFixture.ids.occurrences.draft)).qty).toBe('17');
            expect((await readOccurrence(secondDb, secondFixture.ids.occurrences.draft)).qty).toBe('2');
          } finally {
            recorded.stop();
            view.destroy();
          }
        });
      });
    });
  });
}

describe('SQLite 持久库草稿编辑协议升级', () => {
  it('重连原子替换旧同名守卫，允许draft ECN新行改量并继续保护发布行和结构', async () => {
    const dbName = `ve-${crypto.randomUUID()}`;
    const first = await createBomTestAdapter('wa-sqlite', undefined, { dbName, persistent: true });
    const fixture = await loadBomViewFixture(first.rxdb);
    const trigger = 'bom_line_occurrence_released_header_u';
    try {
      await first.transaction(async executor => {
        await executor.query(`DROP TRIGGER "${trigger}"`);
        await executor.query(`CREATE TRIGGER "${trigger}" BEFORE UPDATE ON "bom$bom_line_occurrence"
          WHEN NEW."qty" IS NOT OLD."qty" AND EXISTS (
            SELECT 1 FROM "bom$bom_header" h JOIN "bom$bom_line" l ON l."headerId" = h."id"
            WHERE l."id" = NEW."lineId" AND h."state" = 'released')
          BEGIN SELECT RAISE(ABORT, 'legacy released occurrence guard'); END`);
      }, false);
      const pending = await readOccurrence(first.rxdb, fixture.ids.occurrences.pending);
      pending.qty = '7';
      await expect(pending.save()).rejects.toThrow('legacy released occurrence guard');
    } finally {
      await disposeBomTestAdapter(first);
    }
    const reopened = await createBomTestAdapter('wa-sqlite', undefined, { dbName, persistent: true });
    try {
      const pending = await readOccurrence(reopened.rxdb, fixture.ids.occurrences.pending);
      pending.qty = '7';
      await pending.save();
      expect((await readOccurrence(reopened.rxdb, pending.id)).qty).toBe('7');
      const released = await readOccurrence(reopened.rxdb, fixture.ids.occurrences.repeat1);
      released.qty = '99';
      await expect(released.save()).rejects.toThrow();
      pending.childItemId = fixture.ids.items.blue;
      await expect(pending.save()).rejects.toThrow();
    } finally {
      await disposeBomTestAdapter(reopened);
    }
  });
});
