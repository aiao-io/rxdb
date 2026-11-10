import {
  Entity,
  EntityBase,
  getEntityMetadata,
  isEntityMatchWhere,
  PropertyType,
  transitionMetadata,
  WorktreeTableSet,
  type RuleGroup
} from '@aiao/rxdb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generate_entity_deletes_sql, get_sql_value } from '../../index.js';
import { buildRuleGroup } from '../../query/query_sql.js';
import { createRealSqliteDatabase, type RealSqliteDatabase } from '../fixtures/real-sqlite.js';

@Entity({
  name: 'LiteralFidelityNote',
  namespace: 'fidelity',
  tableName: 'note',
  properties: [{ name: 'value', type: PropertyType.string }]
})
class LiteralFidelityNote extends EntityBase {}

const noteMetadata = getEntityMetadata(LiteralFidelityNote);

let db: RealSqliteDatabase;

beforeEach(async () => {
  db = await createRealSqliteDatabase();
});

afterEach(() => {
  db.close();
});

describe('内联字面量与绑定参数写入的值逐字节一致', () => {
  it.each(['id\0tail', '\0', 'a\0\0b', "it's\0quoted", '\0lead', 'trail\0'])(
    'get_sql_value(%j) 在引擎里等于同一个绑定参数',
    value => {
      const literal = String(get_sql_value(value));
      expect(literal).not.toContain('\0');
      expect(db.all(`SELECT ${literal} = ?, hex(${literal}) = hex(?)`, [value, value])).toEqual([[1, 1]]);
    }
  );

  it('批量删除含 NUL 的字符串主键只删目标行，去掉 NUL 后同名的旁观行保留', () => {
    const metadata = transitionMetadata({ name: 'NulKey', namespace: 'probe', tableName: 'NulKey' });
    db.exec('CREATE TABLE "probe$NulKey" ("id" TEXT PRIMARY KEY)');
    db.all('INSERT INTO "probe$NulKey" ("id") VALUES (?), (?)', ['id\0tail', 'idtail']);

    db.exec(generate_entity_deletes_sql(metadata, WorktreeTableSet.MAIN, [{ id: 'id\0tail' }] as never[]));

    expect(db.all('SELECT hex("id") FROM "probe$NulKey"')).toEqual([['69647461696C']]);
  });
});

describe('规则值里的空白原样进入 SQL 字面量（与 JS 增量匹配同结论）', () => {
  const OTHER = 'a b';

  it.each([
    ['连续空格', 'a  b'],
    ['换行', 'a\nb'],
    ['tab', 'a\tb'],
    ['混合空白', 'a \t\n b']
  ])('%s：等值 / 不等值 / IN / NOT IN / 区间的命中行与 JS 一致', (_title, wanted) => {
    db.exec('CREATE TABLE "fidelity$note" ("id" TEXT PRIMARY KEY, "value" TEXT)');
    const rows = [
      { id: 'wanted', value: wanted },
      { id: 'other', value: OTHER }
    ];
    for (const row of rows) db.all('INSERT INTO "fidelity$note" ("id", "value") VALUES (?, ?)', [row.id, row.value]);

    const rules = [
      { field: 'value', operator: '=', value: wanted },
      { field: 'value', operator: '!=', value: wanted },
      { field: 'value', operator: 'in', value: [wanted] },
      { field: 'value', operator: 'notIn', value: [wanted] },
      { field: 'value', operator: 'between', value: [wanted, wanted] },
      { field: 'value', operator: '>=', value: wanted }
    ];
    for (const rule of rules) {
      const where = { combinator: 'and', rules: [rule] } as RuleGroup;
      const sql = buildRuleGroup(where, new Map(), noteMetadata);
      const sqlIds = db.all(`SELECT _."id" FROM "fidelity$note" AS _ WHERE ${sql} ORDER BY 1`).map(row => row[0]);
      const jsIds = rows
        .filter(row => isEntityMatchWhere(row, where))
        .map(row => row.id)
        .sort();
      expect({ operator: rule.operator, ids: sqlIds }).toEqual({ operator: rule.operator, ids: jsIds });
    }
  });
});
