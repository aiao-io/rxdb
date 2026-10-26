/**
 * @fileoverview PGlite 上跑可写检出位的全文索引套件（US-314 B2.5）。
 *
 * @remarks
 * 影子表集落在 `<命名空间>$<后缀>` 这些 schema 里。全文索引是表上的 `_fts` 列、GIN 索引 `<表>__fts_idx`、
 * 触发器 `<表>__fts_trg` 与同一 schema 里的触发器函数 `<表>__fts_update`；目录里按 schema 名的后缀找，
 * 与适配器删表集的找法相同（`wt_` 的下划线在 `LIKE` 里是通配符，所以用 `right()` 比）。
 */

import { RxDB, SyncType, type WorktreeTableSet } from '@aiao/rxdb';
// 类型导入允许：`@nx/enforce-module-boundaries` 只约束运行时静态导入，适配器本体在下面按需 `import()`。
import type { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';

import type { RxDBPluginSearch } from '../../plugin.js';
import {
  searchPluginForWorktreeSuite,
  WorktreeSearchNote,
  worktreeSearchSuite,
  type WorktreeSearchHarness
} from '../worktree-search.suite.js';

/** 这套表的全文索引对象：`_fts` 列、GIN 索引、触发器与触发器函数 */
const FTS_OBJECTS_SQL = [
  `SELECT 'column:' || table_schema || '.' || table_name AS name FROM information_schema.columns`,
  `  WHERE column_name = '_fts' AND right(table_schema, length($1::text)) = $1::text`,
  `UNION ALL`,
  `SELECT 'index:' || schemaname || '.' || indexname FROM pg_indexes`,
  `  WHERE right(indexname, 9) = '__fts_idx' AND right(schemaname, length($1::text)) = $1::text`,
  `UNION ALL`,
  `SELECT 'trigger:' || n.nspname || '.' || t.tgname FROM pg_trigger t`,
  `  JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace`,
  `  WHERE NOT t.tgisinternal AND right(t.tgname, 9) = '__fts_trg' AND right(n.nspname, length($1::text)) = $1::text`,
  `UNION ALL`,
  `SELECT 'function:' || n.nspname || '.' || p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace`,
  `  WHERE right(p.proname, 12) = '__fts_update' AND right(n.nspname, length($1::text)) = $1::text`
].join('\n');

/** 这套表的 schema 删了，表、列、索引、触发器与函数就都跟着没了 */
const SCHEMAS_SQL = `SELECT 'schema:' || nspname AS name FROM pg_namespace WHERE right(nspname, length($1::text)) = $1::text`;

const openPgHarness = async (): Promise<WorktreeSearchHarness> => {
  const rxdb = new RxDB({
    dbName: `pg-worktree-search-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    context: { userId: 'tester' },
    entities: [WorktreeSearchNote],
    sync: { local: { adapter: 'pglite' }, type: SyncType.None }
  });
  let adapter: RxDBAdapterPGlite | undefined;
  rxdb.adapter('pglite', async db => {
    const { RxDBAdapterPGlite: PGliteAdapter } = await import('@aiao/rxdb-adapter-pglite');
    adapter = new PGliteAdapter(db, { store: 'memory' });
    return adapter;
  });
  rxdb.use(searchPluginForWorktreeSuite);
  await rxdb.connect('pglite');
  await (rxdb.getPlugins('search')[0] as RxDBPluginSearch).ready;
  const namesOf = async (sql: string, tableSet: WorktreeTableSet): Promise<readonly string[]> =>
    (await adapter!.rawQuery(sql, [`$${tableSet.suffix}`])).rows.map(row => String(row[0])).sort();
  return {
    rxdb,
    ftsObjectsOf: tableSet => namesOf(FTS_OBJECTS_SQL, tableSet),
    leftoversOf: tableSet => namesOf(SCHEMAS_SQL, tableSet),
    cleanup: () => rxdb.disconnectAll()
  };
};

worktreeSearchSuite({ name: 'pglite', open: openPgHarness });
