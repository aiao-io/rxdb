import { getEntityMetadata, WorktreeTableSet } from '@aiao/rxdb';
import { RxDBAdapterSqlite, sqliteGetTableNameByMetadata } from '@aiao/rxdb-adapter-sqlite-wasm';
import { describe, expect, it, vi } from 'vitest';

import { DesktopFile } from '../disk/desktop-file.entity';
import { adapterInspector } from './schema-probe';
import { SCHEMA_RECORD_KEY } from './schema-version';
import { SystemPreference } from './system-preference.entity';

/** 适配器的只读入口：`internalQuery` 返回按结果集分组的行，`isTableExisted` 问表在不在。 */
function fakeAdapter(rows: unknown[][][] = [[]]) {
  const adapter = {
    internalQuery: vi.fn<(sql: string, bindings?: unknown[]) => Promise<{ results: { rows: unknown[][] }[] }>>(
      async () => ({ results: rows.map(group => ({ rows: group })) })
    ),
    isTableExisted: vi.fn<(entity: unknown) => Promise<boolean>>(async () => true)
  };
  return { adapter, inspector: adapterInspector(adapter as unknown as RxDBAdapterSqlite) };
}

const queriedSql = (adapter: ReturnType<typeof fakeAdapter>['adapter']): string =>
  String(adapter.internalQuery.mock.calls[0][0]);

describe('adapterInspector：包着 sqlite 适配器的只读探测面', () => {
  it('tableName 与适配器建表时用的是同一个物理表名', () => {
    const { inspector } = fakeAdapter();
    const expected = sqliteGetTableNameByMetadata(getEntityMetadata(DesktopFile), WorktreeTableSet.MAIN);
    expect(inspector.tableName(DesktopFile)).toBe(expected);
    expect(inspector.tableName(SystemPreference)).toContain('system_preference');
  });

  it('tableExists 直接问适配器', async () => {
    const { adapter, inspector } = fakeAdapter();
    adapter.isTableExisted.mockResolvedValueOnce(false);
    expect(await inspector.tableExists(DesktopFile)).toBe(false);
    expect(await inspector.tableExists(DesktopFile)).toBe(true);
    expect(adapter.isTableExisted).toHaveBeenCalledWith(DesktopFile);
  });

  it('columns 用 pragma_table_info 读表里现有的列名，表名走绑定参数', async () => {
    const { adapter, inspector } = fakeAdapter([
      [
        ['id', 'text'],
        ['name', 'text']
      ]
    ]);
    expect(await inspector.columns('desktop_file')).toEqual(['id', 'name']);
    expect(adapter.internalQuery).toHaveBeenCalledExactlyOnceWith('SELECT "name" FROM pragma_table_info(?)', [
      'desktop_file'
    ]);
  });

  it('columns 合并多个结果集里的行', async () => {
    const { inspector } = fakeAdapter([[['a']], [['b'], ['c']]]);
    expect(await inspector.columns('t')).toEqual(['a', 'b', 'c']);
  });

  it('readRecord 按键取版本记录那一行，列名与表名都加引号，键走绑定参数', async () => {
    const { adapter, inspector } = fakeAdapter([[]]);
    await inspector.readRecord();
    const sql = queriedSql(adapter);
    expect(sql).toMatch(/^SELECT "value" FROM ".*system_preference.*" WHERE "key" = \? LIMIT 1$/);
    expect(adapter.internalQuery.mock.calls[0][1]).toEqual([SCHEMA_RECORD_KEY]);
  });

  it('没有这一行时记录是 undefined', async () => {
    const { inspector } = fakeAdapter([[]]);
    expect(await inspector.readRecord()).toBeUndefined();
  });

  it('值列是 JSON 文本：解析成对象交给判定', async () => {
    const record = { version: 3, build: 'abc', upgradedAt: 9 };
    const { inspector } = fakeAdapter([[[JSON.stringify(record)]]]);
    expect(await inspector.readRecord()).toEqual(record);
  });

  it('解析不了的文本原样交出去，由判定归为「版本记录无法解析」', async () => {
    const { inspector } = fakeAdapter([[['{not json']]]);
    expect(await inspector.readRecord()).toBe('{not json');
  });

  it('适配器已经给出非字符串的值（比如已解析的对象）时直接使用', async () => {
    const record = { version: 1 };
    const { inspector } = fakeAdapter([[[record]]]);
    expect(await inspector.readRecord()).toBe(record);
  });
});
