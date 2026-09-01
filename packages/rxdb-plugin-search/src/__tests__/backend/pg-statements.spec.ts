import { describe, expect, it } from 'vitest';

import { splitPgStatements } from '../../backend/pg/pg-statements.js';

/** 动态取：静态引入会被 `enforce-module-boundaries` 判为破坏惰性加载（见 pg-fts-contract.ts）。 */
const { buildCreateFtsTableSql, buildFtsTriggersSql } = await import('@aiao/rxdb-adapter-pglite/fts');

const FIELDS = [
  { name: 'title', isArray: false },
  { name: 'tags', isArray: true }
] as const;

describe('splitPgStatements', () => {
  it('拆分 buildCreateFtsTableSql 的 2 条 DDL', () => {
    const statements = splitPgStatements(buildCreateFtsTableSql('docs', FIELDS));
    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain('ALTER TABLE');
    expect(statements[1]).toContain('CREATE INDEX');
  });

  it('美元引用体内的分号不会被当作语句分隔符', () => {
    const statements = splitPgStatements(buildFtsTriggersSql('docs', FIELDS));
    expect(statements).toHaveLength(3);
    // 函数体是多行且内部含 `;`，必须整体保留为一条语句
    expect(statements[0]).toContain('CREATE OR REPLACE FUNCTION');
    expect(statements[0]).toContain('RETURN NEW;');
    expect(statements[0]).toContain('LANGUAGE plpgsql');
    expect(statements[1]).toContain('DROP TRIGGER IF EXISTS');
    expect(statements[2]).toContain('CREATE TRIGGER');
  });

  it('支持带标签的美元引用', () => {
    const sql = `SELECT 1; CREATE FUNCTION f() RETURNS int AS $body$ BEGIN; RETURN 1; END; $body$ LANGUAGE plpgsql; SELECT 2;`;
    const statements = splitPgStatements(sql);
    expect(statements).toHaveLength(3);
    expect(statements[1]).toContain('$body$ BEGIN; RETURN 1; END; $body$');
  });

  it('单引号字符串内的分号不会被当作语句分隔符', () => {
    expect(splitPgStatements(`SELECT 'a;b'; SELECT 2;`)).toEqual([`SELECT 'a;b'`, `SELECT 2`]);
  });

  it('双引号标识符内的分号不会被当作语句分隔符', () => {
    expect(splitPgStatements(`SELECT "a;b"; SELECT 2;`)).toEqual([`SELECT "a;b"`, `SELECT 2`]);
  });

  it('丢弃空语句与纯空白', () => {
    expect(splitPgStatements(`;; SELECT 1;;\n\n ;`)).toEqual(['SELECT 1']);
    expect(splitPgStatements('   \n ')).toEqual([]);
  });

  it('末尾无分号的语句同样被产出', () => {
    expect(splitPgStatements('SELECT 1')).toEqual(['SELECT 1']);
  });
});
