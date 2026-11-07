import { describe, expect, it } from 'vitest';
import { designToSqlSchema, diffSqlSchema, generateCreateSql } from '../../sql';
import type { DesignSqlInput } from '../../sql/types';

/**
 * 覆盖 designer-state `#toDesignSqlInput` 同一形状的端到端线索：
 * design snapshot → schema → .sql / .diff.sql 文件内容
 */
describe('design SQL snapshot pipeline', () => {
  const input: DesignSqlInput = {
    entities: [{ id: 'e1', name: 'Item', tableName: 'items', extendsBase: 'EntityBase' }],
    properties: [
      {
        id: 'p1',
        name: 'title',
        propertyType: 'string',
        columnName: 'title',
        isRequired: true,
        sortOrder: 'a'
      }
    ],
    relations: [],
    indexes: [],
    propertyEntityIds: { p1: 'e1' }
  };

  it('produces a single .sql-ready string for a minimal design', () => {
    const { sql } = generateCreateSql(designToSqlSchema(input));
    expect(sql).toContain('CREATE TABLE items');
    expect(sql).toContain('title text NOT NULL');
    expect(sql).toContain('id uuid PRIMARY KEY');
  });

  it('compare against empty remote yields CREATE-heavy diff (onCompareSql default)', () => {
    const desired = designToSqlSchema(input);
    const { sql } = diffSqlSchema(desired, { tables: [] });
    expect(sql).toContain('CREATE TABLE items');
    expect(sql).toContain('title text NOT NULL');
  });

  it('compare against matching remote yields empty sql', () => {
    const desired = designToSqlSchema(input);
    const { sql } = diffSqlSchema(desired, desired);
    expect(sql).toBe('');
  });
});
