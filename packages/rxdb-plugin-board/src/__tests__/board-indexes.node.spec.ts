import { RxDB, SyncType, type RawQueryResult } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';

import { Board, BoardLabel, Column, Task, TaskLabel } from '../entities/index.js';

/**
 * 外键与热路径索引：存储层不为外键自动建索引，列渲染（`columnId` 等值 + 组内 `sortOrder`）、
 * 板内列序、删标签按 `labelId` 反查关联都要有前缀匹配的索引，否则任务量上来后退化成全表扫。
 */
describe('看板表索引', () => {
  let rxdb: RxDB | null = null;

  afterEach(async () => {
    await rxdb?.disconnectAll().catch(() => undefined);
    rxdb = null;
  });

  /** 每张表的索引列序列（按索引名排序，列名保持索引内顺序）。 */
  const indexColumns = async (db: RxDB): Promise<Map<string, string[][]>> => {
    const adapter = (await firstValueFrom(db.localAdapter$)) as unknown as {
      rawQuery(sql: string): Promise<RawQueryResult>;
    };
    const raw = await adapter.rawQuery(`
      SELECT t.relname AS table_name, array_agg(a.attname::text ORDER BY k.ordinality) AS columns
      FROM pg_index i
      JOIN pg_class t ON t.oid = i.indrelid
      JOIN pg_class c ON c.oid = i.indexrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum, ordinality)
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
      WHERE n.nspname = 'board'
      GROUP BY t.relname, c.relname
      ORDER BY t.relname, c.relname`);
    const byTable = new Map<string, string[][]>();
    for (const [table, columns] of raw.rows as [string, string[]][]) {
      byTable.set(table, [...(byTable.get(table) ?? []), columns]);
    }
    return byTable;
  };

  it('任务按列 + 排序键、列按板 + 排序键、关联按标签都有索引', async () => {
    rxdb = new RxDB({
      dbName: `board-indexes-${Math.random().toString(36).slice(2)}`,
      entities: [Board, Column, Task, BoardLabel, TaskLabel],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    rxdb.use(rxDBPluginHistory);
    rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    await rxdb.connect('pglite');

    const indexes = await indexColumns(rxdb);
    expect(indexes.get('task')).toContainEqual(['column_id', 'sortOrder']);
    expect(indexes.get('column')).toContainEqual(['board_id', 'sortOrder']);
    expect(indexes.get('task_label')).toContainEqual(['label_id']);
    // 既有唯一约束保持：关联 (task_id, label_id) 与板内标签名
    expect(indexes.get('task_label')).toContainEqual(['task_id', 'label_id']);
    expect(indexes.get('board_label')).toContainEqual(['board_id', 'name']);
  });
});
