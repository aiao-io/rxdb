/**
 * T006-T007: PostgreSQL SQL 方言测试
 *
 * 测试 PostgreSQL 特定的 SQL 语法转换
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { pgDialect, PostgreSQLDialect } from '../sql_dialect.js';

describe('PostgreSQL 方言', () => {
  let dialect: PostgreSQLDialect;

  beforeAll(() => {
    dialect = new PostgreSQLDialect();
  });

  describe('基础语法', () => {
    it('应该返回正确的 RETURNING 子句', () => {
      expect(dialect.getReturningClause()).toBe('RETURNING *');
    });

    it('应该生成正确的参数占位符', () => {
      expect(dialect.getParameterPlaceholder(1)).toBe('$1');
      expect(dialect.getParameterPlaceholder(5)).toBe('$5');
      expect(dialect.getParameterPlaceholder(100)).toBe('$100');
    });

    it('应该正确转义标识符', () => {
      expect(dialect.escapeIdentifier('tableName')).toBe('"tableName"');
      expect(dialect.escapeIdentifier('User')).toBe('"User"');
      expect(dialect.escapeIdentifier('my_table')).toBe('"my_table"');
    });

    it('应该正确转义包含双引号的标识符', () => {
      // PostgreSQL 中双引号需要加倍
      expect(dialect.escapeIdentifier('table"name')).toBe('"table""name"');
      expect(dialect.escapeIdentifier('"User"')).toBe('"""User"""');
    });

    it('应该返回正确的 JSON 提取操作符', () => {
      expect(dialect.getJsonExtractOperator()).toBe('->>');
    });

    it('应该返回正确的字符串连接操作符', () => {
      expect(dialect.getConcatOperator()).toBe('||');
    });
  });

  describe('批量插入 SQL 生成', () => {
    it('应该生成单行插入 SQL', () => {
      const sql = dialect.generateBatchInsert('users', ['id', 'name', 'age'], 1);
      expect(sql).toBe('INSERT INTO "users" ("id", "name", "age") VALUES ($1, $2, $3) RETURNING *');
    });

    it('应该生成多行插入 SQL', () => {
      const sql = dialect.generateBatchInsert('users', ['id', 'name'], 3);
      expect(sql).toBe('INSERT INTO "users" ("id", "name") VALUES ($1, $2), ($3, $4), ($5, $6) RETURNING *');
    });

    it('应该正确处理表名和列名转义', () => {
      const sql = dialect.generateBatchInsert('my"table', ['col"1', 'col2'], 1);
      expect(sql).toContain('"my""table"');
      expect(sql).toContain('"col""1"');
      expect(sql).toContain('"col2"');
    });

    it('应该为大量行生成正确的参数序号', () => {
      const sql = dialect.generateBatchInsert('test', ['a', 'b', 'c'], 10);
      // 10 行 × 3 列 = 30 个参数
      expect(sql).toContain('$30');
      expect(sql).toContain('($28, $29, $30)'); // 最后一行
    });
  });

  describe('批量更新 SQL 生成', () => {
    // 原用例断言 `FROM (VALUES ($1))` 与 `AS temp("id", name, age)` ——
    // 一个占位符配 3 列别名（42P10）、更新列名未转义，把不可执行的形态锁成了正确期望（PGL-014）
    it('应该生成 UPDATE FROM 语法', () => {
      const sql = dialect.generateBatchUpdate('users', 'id', ['name', 'age']);
      expect(sql).toContain('UPDATE "users"');
      expect(sql).toContain('FROM (VALUES ($1, $2, $3))');
      expect(sql).toContain('AS temp("id", "name", "age")');
      expect(sql).toContain('WHERE "users"."id" = temp."id"');
      expect(sql).toContain('RETURNING *');
    });

    it('rowCount 决定占位符组数', () => {
      const sql = dialect.generateBatchUpdate('users', 'id', ['name'], 3);
      expect(sql).toContain('FROM (VALUES ($1, $2), ($3, $4), ($5, $6))');
    });

    it('拒绝非法的 rowCount 与空更新列', () => {
      expect(() => dialect.generateBatchUpdate('users', 'id', ['name'], 0)).toThrow(/rowCount/);
      expect(() => dialect.generateBatchUpdate('users', 'id', [])).toThrow(/updateColumns/);
    });

    it('应该正确设置更新列', () => {
      const sql = dialect.generateBatchUpdate('users', 'id', ['name', 'email']);
      expect(sql).toContain('"name" = temp."name"');
      expect(sql).toContain('"email" = temp."email"');
    });

    it('应该正确转义表名和列名', () => {
      const sql = dialect.generateBatchUpdate('my"table', 'pk"id', ['col"1']);
      expect(sql).toContain('"my""table"');
      expect(sql).toContain('"pk""id"');
      expect(sql).toContain('"col""1"');
    });
  });

  describe('导出的单例', () => {
    it('pgDialect 应该是 PostgreSQLDialect 实例', () => {
      expect(pgDialect).toBeInstanceOf(PostgreSQLDialect);
    });

    it('pgDialect 应该可以正常使用', () => {
      expect(pgDialect.getParameterPlaceholder(1)).toBe('$1');
      expect(pgDialect.escapeIdentifier('test')).toBe('"test"');
    });
  });
});
