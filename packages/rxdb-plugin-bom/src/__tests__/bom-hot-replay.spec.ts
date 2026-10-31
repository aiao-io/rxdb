import {
  compileGeneratedColumn,
  getEntityMetadata,
  getEntityStatus,
  getEntityStorageMetadata,
  type EntityStorageOverride,
  type SwitchVersionActions,
  type UUID
} from '@aiao/rxdb';
import { restorePGliteDatabase } from '@aiao/rxdb-adapter-pglite';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { firstValueFrom } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { BOM_ENTITIES, BomAttrDef, BomItem } from '../entities.js';
import { importBomDraft } from '../resolve/integration.js';
import { deterministicId } from '../testing/scooter-dataset.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestAdapter } from './test-utils.js';

const profile = (key = 'rohs_status'): EntityStorageOverride[] => [
  {
    entity: BomItem,
    generatedColumns: [
      {
        name: 'rohs_hot',
        expression: {
          kind: 'jsonScalar',
          property: 'ext',
          key,
          dataType: 'string',
          jsonText: true
        }
      }
    ],
    indexes: [{ name: 'rohs_lookup', properties: ['rohs_hot'] }]
  }
];
const readRows = async (adapter: BomTestAdapter) => {
  const metadata = getEntityStorageMetadata(adapter.rxdb, BomItem);
  const column = compileGeneratedColumn(
    metadata,
    metadata.generatedColumnMap.get('rohs_hot')!,
    adapter.name === 'pglite' ? 'postgres' : 'sqlite'
  );
  return (
    await adapter.transaction(
      executor =>
        executor.query(
          `SELECT "itemNo", "ext", "${column.columnName}" FROM ${executor.tableRef(BomItem)} ORDER BY "itemNo"`
        ),
      false
    )
  ).rows;
};
const define = async (adapter: BomTestAdapter, code = 'rohs_status') => {
  const definition = adapter.rxdb.entityManager.instantiate(BomAttrDef, {
    code,
    dataType: 'string',
    appliesTo: 'item'
  });
  await adapter.rxdb.entityManager.getRepository(BomAttrDef).create(definition);
};

for (const backend of ['wa-sqlite', 'pglite'] as const) {
  describe(`BOM 派生列的写入与原字段重放 [${backend}]`, () => {
    it('单条/saveMany/导入/undo/redo/分支/远端应用只重放 ext，日志不包含派生列', async () => {
      const adapter = await createBomTestAdapter(backend, BOM_ENTITIES, {
        entityStorage: profile(),
        configure: db => db.use(rxDBPluginHistory)
      });
      try {
        await define(adapter);
        const db = adapter.rxdb;
        const first = db.entityManager.instantiate(BomItem, { itemNo: 'a', ext: '{"rohs_status":"yes"}' });
        const second = db.entityManager.instantiate(BomItem, { itemNo: 'b', ext: '{"rohs_status":"no"}' });
        const warning = vi.spyOn(console, 'warn');
        await db.entityManager.saveMany([first, second]);
        for (const row of [first, second]) {
          expect(Object.keys(row).some(key => key.startsWith('gc_'))).toBe(false);
          expect(Object.keys(getEntityStatus(row).origin).some(key => key.startsWith('gc_'))).toBe(false);
        }
        expect(warning.mock.calls.flat().join(' ')).not.toMatch(/gc_rohs_hot_/);
        expect((await readRows(adapter)).map(row => row[2])).toEqual(['yes', 'no']);
        first.ext = '{"rohs_status":"changed"}';
        await first.save();
        expect((await readRows(adapter))[0][2]).toBe('changed');
        await db.versionManager.history().undo();
        expect((await readRows(adapter))[0][2]).toBe('yes');
        await db.versionManager.history().redo();
        expect((await readRows(adapter))[0][2]).toBe('changed');
        await db.versionManager.createBranch('hot-feature');
        await db.versionManager.switchBranch('hot-feature');
        await db.entityManager.getRepository(BomItem).update(first, { ext: '{"rohs_status":"feature"}' });
        expect((await readRows(adapter))[0][2]).toBe('feature');
        await db.versionManager.switchBranch('main');
        expect((await readRows(adapter))[0][2]).toBe('changed');
        await db.versionManager.switchBranch('hot-feature');
        expect((await readRows(adapter))[0][2]).toBe('feature');
        const actions: SwitchVersionActions<typeof BomItem> = {
          deletes: new Map(),
          inserts: new Map(),
          updates: new Map([
            [`bom:BomItem:${first.id}`, { patch: { ext: '{"rohs_status":"remote"}' }, inversePatch: null }]
          ])
        };
        const changeTable = backend === 'pglite' ? '"rxdb"."rxdb_change"' : '"rxdb$rxdb_change"';
        const historyBefore = (
          await adapter.transaction(executor => executor.query(`SELECT "id" FROM ${changeTable}`), false)
        ).rows.length;
        await adapter.mergeChanges(actions, undefined, true);
        expect((await readRows(adapter))[0][2]).toBe('remote');
        const historyAfter = (
          await adapter.transaction(
            executor => executor.query(`SELECT "patch", "inversePatch" FROM ${changeTable}`),
            false
          )
        ).rows;
        expect(historyAfter).toHaveLength(historyBefore);
        expect(JSON.stringify(historyAfter)).not.toContain('gc_');
        expect(
          (
            await importBomDraft(adapter, [
              { kind: 'item', source_ref: 'import-c', itemNo: 'c', ext: '{"rohs_status":"imported"}' }
            ])
          ).committed
        ).toBe(true);
        expect((await readRows(adapter)).map(row => row[2])).toEqual(['remote', 'no', 'imported']);
        const loaded = await firstValueFrom(db.entityManager.getRepository(BomItem).get(first.id));
        expect(Object.keys(loaded).some(key => key.startsWith('gc_'))).toBe(false);
      } finally {
        vi.restoreAllMocks();
        await disposeBomTestAdapter(adapter);
      }
    }, 60_000);

    it('既有物理备份恢复保留派生声明与原日志，恢复后 ext 保存继续自动重算', async () => {
      const source = await createBomTestAdapter(backend, BOM_ENTITIES, {
        dbName: `h-${crypto.randomUUID()}`,
        persistent: true,
        entityStorage: profile()
      });
      const target = await createBomTestAdapter(backend, BOM_ENTITIES, {
        dbName: `h-${crypto.randomUUID()}`,
        persistent: true,
        entityStorage: profile(),
        deferConnect: true
      });
      try {
        await define(source);
        const row = source.rxdb.entityManager.instantiate(BomItem, {
          itemNo: 'backup',
          ext: '{"rohs_status":"before"}'
        });
        await source.rxdb.entityManager.getRepository(BomItem).create(row);
        const before = await readRows(source);
        const chunks: Uint8Array[] = [];
        await source.backup(
          new WritableStream<Uint8Array>({
            write(chunk) {
              chunks.push(chunk.slice());
            }
          })
        );
        await disposeBomTestAdapter(source);
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            for (const chunk of chunks) controller.enqueue(chunk);
            controller.close();
          }
        });
        if (target instanceof RxDBAdapterWaSqlite) await target.restore(stream);
        else await restorePGliteDatabase(stream, { rxdb: target.rxdb, options: { store: 'idb' } });
        await target.rxdb.connect(backend);
        expect(await readRows(target)).toEqual(before);
        await expect(target.checkEntityConstraints([BomItem])).resolves.toBeUndefined();
        const repository = target.rxdb.entityManager.getRepository(BomItem);
        const restored = await firstValueFrom(repository.get(row.id));
        await repository.update(restored, { ext: '{"rohs_status":"after"}' });
        expect((await readRows(target))[0][2]).toBe('after');
        expect(Object.keys(restored).some(key => key.startsWith('gc_'))).toBe(false);
      } finally {
        await disposeBomTestAdapter(source);
        await disposeBomTestAdapter(target);
      }
    }, 60_000);

    it('同一个 BomItem 类在两个活库选择不同热键，真实 DDL/值/漂移核对彼此隔离', async () => {
      const first = await createBomTestAdapter(backend, BOM_ENTITIES, { entityStorage: profile('rohs_status') });
      const second = await createBomTestAdapter(backend, BOM_ENTITIES, { entityStorage: profile('other') });
      try {
        await define(first, 'rohs_status');
        await define(second, 'other');
        const rowId = deterministicId(`two-active-${backend}`);
        const seed = async (adapter: BomTestAdapter, ext: string) => {
          const row = adapter.rxdb.entityManager.instantiate(BomItem, { id: rowId as UUID, itemNo: 'same', ext });
          await adapter.rxdb.entityManager.getRepository(BomItem).create(row);
        };
        await seed(first, '{"rohs_status":"first"}');
        await seed(second, '{"other":"second"}');
        expect((await readRows(first))[0][2]).toBe('first');
        expect((await readRows(second))[0][2]).toBe('second');
        await expect(first.checkEntityConstraints([BomItem])).resolves.toBeUndefined();
        await expect(second.checkEntityConstraints([BomItem])).resolves.toBeUndefined();
        expect(getEntityMetadata(BomItem).generatedColumnMap.size).toBe(0);
      } finally {
        await disposeBomTestAdapter(first);
        await disposeBomTestAdapter(second);
      }
    }, 60_000);
  });
}
