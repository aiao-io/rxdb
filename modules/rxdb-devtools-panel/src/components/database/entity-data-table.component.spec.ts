import type { DevToolsEntityModel } from '@aiao/rxdb-devtools';
import { describe, expect, it } from 'vitest';
import {
  buildEntityDataAccessibilityRows,
  buildEntityDataColumns,
  ENTITY_DATA_TABLE_OPTIONS,
  resolveEntityFields
} from './entity-data-table.component';

function asRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

describe('EntityDataTableComponent helpers', () => {
  it('空数据时使用自适应宽度填满表格容器', () => {
    expect(ENTITY_DATA_TABLE_OPTIONS.widthMode).toBe('adaptive');
  });

  it('为画布表格生成字段、运行时类型和值的可访问文本', () => {
    const rows = buildEntityDataAccessibilityRows([{ startedAt: '2026-10-31T00:00:00.000Z' }]);

    expect(rows).toContainEqual({
      key: 'startedAt',
      path: '$.startedAt',
      depth: 1,
      kind: 'string',
      value: '2026-10-31T00:00:00.000Z'
    });
  });

  it('按模型字段顺序构建只读类型化列，并保留旧连接器返回的未知字段', () => {
    const model: DevToolsEntityModel = {
      fields: [
        { name: 'id', type: 'uuid', displayName: 'ID' },
        { name: 'active', type: 'boolean', displayName: '启用' },
        { name: 'status', type: 'enum', enumValues: ['ready'], options: { ready: { label: '就绪' } } }
      ]
    };

    const columns = buildEntityDataColumns(model, [{ id: '1', active: true, status: 'ready', legacy: 1 }]);
    const fields = columns.map(column => asRecord(column)['field']);

    expect(fields).toEqual(['id', 'active', 'status', 'legacy', 'actions']);
    expect(asRecord(columns[1])['cellType']).toBe('switch');
    expect(asRecord(columns[1])['disable']).toBe(true);
    expect(asRecord(columns[2])['fieldFormat']).toBeTypeOf('function');
    expect(asRecord(columns[0])['editor']).toBeUndefined();
    expect(asRecord(columns[4])['icon']).toBeTypeOf('function');
  });

  it('没有模型消息时按数据行推导字段类型', () => {
    const fields = resolveEntityFields(null, [
      { id: '1', createdAt: '2026-10-31T00:00:00.000Z', count: 2, enabled: false, tags: ['a'], config: { mode: 'x' } }
    ]);

    expect(fields).toEqual([
      { name: 'id', type: 'uuid' },
      { name: 'createdAt', type: 'date' },
      { name: 'count', type: 'integer' },
      { name: 'enabled', type: 'boolean' },
      { name: 'tags', type: 'stringArray' },
      { name: 'config', type: 'json' }
    ]);
  });

  it('无法从空数组推导元素类型时按 JSON 展示', () => {
    expect(resolveEntityFields(null, [{ tags: [] }])).toEqual([{ name: 'tags', type: 'json' }]);
  });
});
