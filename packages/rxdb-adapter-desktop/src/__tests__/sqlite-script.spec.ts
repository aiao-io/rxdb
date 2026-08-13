import { describe, expect, it } from 'vitest';
import { splitSqliteScript } from '../sqlite-script.js';

describe('splitSqliteScript', () => {
  it.each([
    ['SELECT 1', ['SELECT 1']],
    ['SELECT 1;', ['SELECT 1;']],
    ['SELECT 1; SELECT 2;', ['SELECT 1;', ' SELECT 2;']],
    ['SELECT 1;;SELECT 2', ['SELECT 1;', 'SELECT 2']],
    ['SELECT 1; SELECT 2', ['SELECT 1;', ' SELECT 2']]
  ])('splits %s', (sql, expected) => {
    expect(splitSqliteScript(sql)).toEqual(expected);
  });

  it.each([
    ['', []],
    ['   \n\t ', []],
    [';', []],
    ['-- just a comment', []],
    ['/* just a comment */', []],
    ['SELECT 1; -- trailing comment', ['SELECT 1;']]
  ])('yields no statement for %s', (sql, expected) => {
    expect(splitSqliteScript(sql)).toEqual(expected);
  });

  // 分号在字面量/标识符/注释里不是语句边界；naive 的 `split(';')` 会把这些 SQL 拦腰截断
  it.each([
    ["SELECT ';'", "single quoted literal"],
    ["SELECT 'a;b''c;d'", 'escaped quote inside a literal'],
    ['SELECT "a;b"', 'double quoted identifier'],
    ['SELECT [a;b]', 'bracketed identifier'],
    ['SELECT `a;b`', 'backtick identifier'],
    ['SELECT 1 -- ends here; really\n', 'line comment'],
    ['SELECT /* a;b */ 1', 'block comment']
  ])('keeps %s together (%s)', sql => {
    expect(splitSqliteScript(sql)).toEqual([sql]);
  });

  // 触发器体内的分号属于 BEGIN...END，把它当边界会生成两条都无法编译的碎片
  it('keeps a trigger body with inner semicolons as one statement', () => {
    const sql =
      'CREATE TRIGGER t AFTER INSERT ON x BEGIN ' +
      "INSERT INTO log VALUES (1); UPDATE y SET a = 'b;c'; END;";
    expect(splitSqliteScript(sql)).toEqual([sql]);
  });

  it('keeps a TEMP trigger body as one statement', () => {
    const sql = 'CREATE TEMP TRIGGER t AFTER DELETE ON x BEGIN SELECT notify(1); END;';
    expect(splitSqliteScript(sql)).toEqual([sql]);
  });

  it('separates the statement that follows a trigger body', () => {
    const trigger = 'CREATE TRIGGER t AFTER INSERT ON x BEGIN SELECT notify(1); END;';
    expect(splitSqliteScript(`${trigger}\nUPDATE y SET a = 1 RETURNING *;`)).toEqual([
      trigger,
      '\nUPDATE y SET a = 1 RETURNING *;'
    ]);
  });

  // 切不动的输入交给 SQLite 报语法错，本函数不猜也不静默丢弃
  it.each([
    ["SELECT 'unterminated", 'unterminated literal'],
    ['SELECT /* unterminated', 'unterminated block comment'],
    ['SELECT [unterminated', 'unterminated bracket']
  ])('passes %s through untouched (%s)', sql => {
    expect(splitSqliteScript(sql)).toEqual([sql]);
  });
});
