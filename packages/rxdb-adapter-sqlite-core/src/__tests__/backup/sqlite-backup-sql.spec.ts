/**
 * @fileoverview US-217 SQLite 归档的三道入口校验：行字面量语法、结构 SQL 守卫、schema.json 结构。
 *
 * 恢复端把归档里的文本拼进 SQL 执行，这三道校验是注入防线：只接受 `quote()` 能产出的形状，
 * 多一个字符都报 `corrupt_archive`，而不是交给 SQLite 去「尽量理解」。
 */

import { isRxDBBackupError } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import {
  assertSqliteSchemaSql,
  countSqliteRowLiterals,
  parseSqliteBackupSchema,
  parseSqliteBackupSummary,
  parseSqliteRowsEntryPath,
  sqliteRowsEntryPath,
  sqliteVirtualTableModule
} from '../../backup/sqlite-backup-sql.js';

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (error) {
    return isRxDBBackupError(error) ? error.code : `not-backup-error: ${String(error)}`;
  }
  return undefined;
};

describe('countSqliteRowLiterals', () => {
  it.each([
    ['NULL', 1],
    ['0', 1],
    ['-9223372036854775808', 1],
    ['9223372036854775807', 1],
    ['1.5', 1],
    ['-0.25', 1],
    ['1.0e+300', 1],
    ['9.0e+999', 1],
    ['-9.0e+999', 1],
    ['1.2345678901234567e-05', 1],
    ["''", 1],
    ["'it''s'", 1],
    ["'中文备注'", 1],
    ["'a\nb'", 1],
    ["X''", 1],
    ["X'00FFab'", 1],
    ["CAST(X'610062' AS TEXT)", 1]
  ])('单列 %s 合法', (literal, arity) => {
    expect(countSqliteRowLiterals(`(${literal})`, arity)).toBe(1);
  });

  it('多行多列按行计数', () => {
    expect(countSqliteRowLiterals("(1,'a',NULL),(2,'b',X'00'),(3,'c',1.5)", 3)).toBe(3);
  });

  it.each([
    ['空文本', '', 1],
    ['列数少', '(1)', 2],
    ['列数多', '(1,2)', 1],
    ['行间多逗号', '(1),,(2)', 1],
    ['结尾逗号', '(1),', 1],
    ['空行', '()', 1],
    ['多余空白', '( 1)', 1],
    ['小写 null', '(null)', 1],
    ['未闭合文本', "('abc)", 1],
    ['文本后有尾巴', "('a'||'b')", 1],
    ['奇数位 hex', "(X'0')", 1],
    ['非 hex 字符', "(X'zz')", 1],
    ['CAST 拼写不同', "(CAST(X'61' AS BLOB))", 1],
    ['子查询注入', '((SELECT 1))', 1],
    ['语句注入', '(1);DROP TABLE t;--', 1],
    ['函数调用', '(abs(1))', 1],
    ['正号', '(+1)', 1],
    ['缺整数部分', '(.5)', 1],
    ['缺小数位', '(1.)', 1],
    ['缺指数位', '(1e)', 1],
    ['文本里有 NUL', "('a\u0000b')", 1],
    ['外层没有括号', '1', 1]
  ])('%s 报 corrupt_archive', (_label, text, arity) => {
    expect(codeOf(() => countSqliteRowLiterals(text, arity))).toBe('corrupt_archive');
  });

  it('长 blob 与长文本线性扫描，不走正则回溯', () => {
    const hex = 'AB'.repeat(4 * 1024 * 1024);
    const text = 'x'.repeat(4 * 1024 * 1024);
    expect(countSqliteRowLiterals(`(X'${hex}','${text}')`, 2)).toBe(1);
  });
});

describe('assertSqliteSchemaSql', () => {
  it.each([
    ['table', 'CREATE TABLE "t" ("id" INTEGER PRIMARY KEY, "v" TEXT DEFAULT \'a;b\')'],
    ['table', 'CREATE TABLE IF NOT EXISTS t(a, b) WITHOUT ROWID'],
    ['table', "CREATE VIRTUAL TABLE \"_fts_t\" USING fts5(title, content='t', content_rowid='rowid')"],
    ['index', 'CREATE UNIQUE INDEX "i" ON "t" ("v")'],
    ['index', 'CREATE INDEX i ON t(v) WHERE v IS NOT NULL -- ; 注释里的分号'],
    ['view', 'CREATE VIEW v AS SELECT * FROM t /* ; */'],
    ['trigger', 'CREATE TRIGGER tr AFTER INSERT ON t BEGIN INSERT INTO log VALUES (new.id); DELETE FROM x; END'],
    [
      'trigger',
      "CREATE TRIGGER tr AFTER UPDATE ON t WHEN new.v <> 'END; DROP' BEGIN SELECT CASE WHEN 1 THEN 2 END; END"
    ],
    ['trigger', 'create trigger "t;r" after delete on t begin update t set v = 1; end'],
    // 表名、触发器名、WHEN 里的列名都可以是裸的 begin：SQLite 把它当标识符。
    ['trigger', 'CREATE TRIGGER tr AFTER INSERT ON begin BEGIN INSERT INTO log VALUES (new.x); END'],
    ['trigger', 'CREATE TRIGGER begin AFTER INSERT ON t BEGIN SELECT 1; END'],
    ['trigger', 'CREATE TRIGGER tr AFTER UPDATE OF begin ON t WHEN new.begin > 0 BEGIN SELECT new.begin; END'],
    // 触发器体的语句也可以以 WITH 或 VALUES 开头，SQLite 都接受。
    ['trigger', 'CREATE TRIGGER tr AFTER INSERT ON t BEGIN WITH x AS (SELECT 1) SELECT * FROM x; VALUES (1); END']
  ] as const)('%s: %s 合法', (type, sql) => {
    expect(() => assertSqliteSchemaSql(sql, type)).not.toThrow();
  });

  it.each([
    ['table', 'CREATE TABLE t(a); DROP TABLE u'],
    ['table', 'CREATE TEMP TABLE t(a)'],
    ['table', 'CREATE TEMPORARY TABLE t(a)'],
    ['table', 'CREATE INDEX i ON t(a)'],
    ['table', 'DROP TABLE t'],
    ['table', 'ATTACH DATABASE x AS y'],
    ['table', "CREATE TABLE t(a DEFAULT 'x)"],
    ['table', 'CREATE TABLE t(a) /* 未闭合'],
    ['table', 'CREATE TABLE "t(a)'],
    ['table', 'CREATE TABLE [t(a)'],
    ['table', 'CREATE TABLE `t(a)'],
    ['table', 'CREATE TABLE t(a)\u0000; DROP TABLE u'],
    ['index', 'CREATE TABLE t(a)'],
    ['view', 'CREATE VIEW v AS SELECT 1; COMMIT'],
    ['trigger', 'CREATE TRIGGER tr AFTER INSERT ON t BEGIN SELECT 1; END; DROP TABLE t; SELECT 1; END'],
    ['trigger', 'CREATE TRIGGER tr AFTER INSERT ON t BEGIN SELECT 1; END; COMMIT'],
    ['trigger', 'CREATE TRIGGER tr AFTER INSERT ON t; BEGIN SELECT 1; END'],
    ['trigger', 'CREATE TRIGGER tr AFTER INSERT ON t BEGIN SELECT 1; END; ATTACH x AS y; END'],
    ['trigger', 'CREATE TRIGGER tr AFTER INSERT ON t BEGIN PRAGMA x; END'],
    ['trigger', 'CREATE TRIGGER tr AFTER INSERT ON t SELECT 1'],
    ['trigger', 'CREATE TEMP TRIGGER tr AFTER INSERT ON t BEGIN SELECT 1; END'],
    ['trigger', 'CREATE TRIGGER tr AFTER INSERT ON begin BEGIN SELECT 1; END; DROP TABLE t; END'],
    ['trigger', 'CREATE TRIGGER tr AFTER INSERT ON begin; BEGIN SELECT 1; END'],
    ['trigger', 'CREATE TRIGGER tr AFTER INSERT ON t BEGIN INSERT INTO begin SELECT 1; END; SELECT 2; END']
  ] as const)('%s: %s 报 corrupt_archive', (type, sql) => {
    expect(codeOf(() => assertSqliteSchemaSql(sql, type))).toBe('corrupt_archive');
  });
});

const validSchema = () => ({
  version: 1,
  userVersion: 3,
  applicationId: -7,
  tables: [
    {
      name: 't',
      kind: 'normal',
      sql: 'CREATE TABLE t(id INTEGER PRIMARY KEY, v TEXT)',
      columns: ['id', 'v'],
      rowid: null
    },
    {
      name: 'u',
      kind: 'normal',
      sql: 'CREATE TABLE u(v TEXT)',
      columns: ['v'],
      rowid: '_rowid_'
    },
    {
      name: '_fts_t',
      kind: 'virtual',
      sql: 'CREATE VIRTUAL TABLE _fts_t USING fts5(v)',
      columns: [],
      rowid: null
    },
    {
      name: '_fts_t_data',
      kind: 'shadow',
      sql: 'CREATE TABLE _fts_t_data(id INTEGER PRIMARY KEY, block BLOB)',
      columns: ['id', 'block'],
      rowid: null
    }
  ],
  objects: [{ type: 'index', name: 'i', tblName: 't', sql: 'CREATE INDEX i ON t(v)' }],
  sequences: [{ name: 't', seq: '9223372036854775807' }]
});

describe('parseSqliteBackupSchema', () => {
  it('合法结构返回新对象', () => {
    const raw = validSchema();
    const parsed = parseSqliteBackupSchema(raw);
    expect(parsed).toEqual(raw);
    expect(parsed).not.toBe(raw);
    expect(parsed.tables[0]).not.toBe(raw.tables[0]);
  });

  it('触发器有自己的命名空间，可以与表同名', () => {
    const raw = validSchema();
    const trigger = {
      type: 'trigger',
      name: 'T',
      tblName: 't',
      sql: 'CREATE TRIGGER T AFTER INSERT ON t BEGIN SELECT 1; END'
    };
    expect(parseSqliteBackupSchema({ ...raw, objects: [...raw.objects, trigger] }).objects).toHaveLength(2);
  });

  type Mutation = (schema: ReturnType<typeof validSchema>) => unknown;
  it.each<[string, Mutation]>([
    ['不是对象', () => []],
    ['版本不认识', s => ({ ...s, version: 2 })],
    ['userVersion 非整数', s => ({ ...s, userVersion: 1.5 })],
    ['applicationId 超出 32 位', s => ({ ...s, applicationId: 2 ** 31 })],
    ['tables 不是数组', s => ({ ...s, tables: {} })],
    ['表名为空', s => ({ ...s, tables: [{ ...s.tables[0], name: '' }] })],
    ['表名以 sqlite_ 开头', s => ({ ...s, tables: [{ ...s.tables[0], name: 'sqlite_x' }] })],
    ['表名是恢复标记', s => ({ ...s, tables: [{ ...s.tables[0], name: 'rxdb$restore_in_progress' }] })],
    ['kind 不认识', s => ({ ...s, tables: [{ ...s.tables[0], kind: 'temp' }] })],
    ['列名不是字符串', s => ({ ...s, tables: [{ ...s.tables[0], columns: [1] }] })],
    ['列名重复', s => ({ ...s, tables: [{ ...s.tables[0], columns: ['id', 'ID'] }] })],
    ['普通表零列', s => ({ ...s, tables: [{ ...s.tables[0], columns: [] }] })],
    ['虚表带列', s => ({ ...s, tables: [{ ...s.tables[2], columns: ['v'] }] })],
    ['虚表带 rowid', s => ({ ...s, tables: [{ ...s.tables[2], rowid: 'rowid' }] })],
    ['rowid 关键字不认识', s => ({ ...s, tables: [{ ...s.tables[1], rowid: 'x' }] })],
    ['rowid 关键字被列名遮蔽', s => ({ ...s, tables: [{ ...s.tables[1], columns: ['_ROWID_'] }] })],
    ['对象名重复（大小写不敏感）', s => ({ ...s, objects: [{ ...s.objects[0], name: 'T' }] })],
    [
      '触发器名重复（大小写不敏感）',
      s => ({
        ...s,
        objects: ['tr', 'TR'].map(name => ({ type: 'trigger', name, tblName: 't', sql: 'CREATE TRIGGER x' }))
      })
    ],
    ['对象类型不认识', s => ({ ...s, objects: [{ ...s.objects[0], type: 'table' }] })],
    ['对象 tblName 为空', s => ({ ...s, objects: [{ ...s.objects[0], tblName: '' }] })],
    ['sequence 名字不是表', s => ({ ...s, sequences: [{ name: 'nope', seq: '1' }] })],
    ['sequence 值不是整数文本', s => ({ ...s, sequences: [{ name: 't', seq: '1; DROP' }] })],
    ['sequence 值是数字', s => ({ ...s, sequences: [{ name: 't', seq: 1 }] })]
  ])('%s 报 corrupt_archive', (_label, mutate) => {
    expect(codeOf(() => parseSqliteBackupSchema(mutate(validSchema())))).toBe('corrupt_archive');
  });
});

describe('parseSqliteBackupSummary', () => {
  it('行数与表一一对应', () => {
    expect(parseSqliteBackupSummary({ rows: [2, 0, 0, 5] }, 4)).toEqual({ rows: [2, 0, 0, 5] });
  });

  it.each<[string, unknown]>([
    ['不是对象', null],
    ['长度不符', { rows: [1, 2] }],
    ['负数', { rows: [1, -1, 0, 0] }],
    ['非整数', { rows: [1, 0.5, 0, 0] }]
  ])('%s 报 corrupt_archive', (_label, raw) => {
    expect(codeOf(() => parseSqliteBackupSummary(raw, 4))).toBe('corrupt_archive');
  });
});

describe('sqliteVirtualTableModule', () => {
  it.each([
    ['CREATE VIRTUAL TABLE t USING fts5(a)', 'fts5'],
    ['create virtual table "x USING evil" using FTS5 (a)', 'fts5'],
    ["CREATE VIRTUAL TABLE [t] USING vec0(embedding float[4], note='USING other')", 'vec0'],
    ['CREATE VIRTUAL TABLE t /* USING x */ USING rtree(id, a, b)', 'rtree'],
    // 模块名本身也可以加引号，四种引号 SQLite 都接受。
    ['CREATE VIRTUAL TABLE t USING "fts5"(a)', 'fts5'],
    ["CREATE VIRTUAL TABLE t USING 'FTS5' (a)", 'fts5'],
    ['CREATE VIRTUAL TABLE t USING [vec0](embedding float[4])', 'vec0'],
    ['CREATE VIRTUAL TABLE t USING `rtree`(id, a, b)', 'rtree'],
    ['CREATE VIRTUAL TABLE t USING "we""ird"(a)', 'we"ird']
  ])('%s → %s', (sql, module) => {
    expect(sqliteVirtualTableModule(sql)).toBe(module);
  });

  it.each([['CREATE TABLE t(a)'], ['CREATE VIRTUAL TABLE "t USING fts5(a)']])('%s 取不到模块', sql => {
    expect(sqliteVirtualTableModule(sql)).toBeNull();
  });
});

describe('行条目路径', () => {
  it('生成与解析互逆', () => {
    expect(sqliteRowsEntryPath(3, 12)).toBe('sqlite/rows/3/12');
    expect(parseSqliteRowsEntryPath('sqlite/rows/3/12')).toEqual({ table: 3, seq: 12 });
    expect(parseSqliteRowsEntryPath('sqlite/rows/0/0')).toEqual({ table: 0, seq: 0 });
  });

  it.each(['sqlite/rows/01/0', 'sqlite/rows/1/-1', 'sqlite/rows/1', 'sqlite/rows/1/2/3', 'sqlite/schema.json'])(
    '%s 不是行条目',
    path => {
      expect(parseSqliteRowsEntryPath(path)).toBeNull();
    }
  );
});
