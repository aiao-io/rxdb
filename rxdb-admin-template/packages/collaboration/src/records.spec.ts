import { describe, expect, it } from 'vitest';
import type { Records } from './model.js';
import { assertRecords, checkRecords, mergeRecords } from './records.js';
import { parseCommand } from './server/input.js';
const base: Records = { c: { entity: 'AssetCategory', fields: { name: 'Category', description: 'Old' } } };
describe('three-way data contract', () => {
  it('merges independent fields without losing either side', () => {
    const result = mergeRecords(
      base,
      { c: { ...base.c, fields: { ...base.c.fields, name: 'New' } } },
      { c: { ...base.c, fields: { ...base.c.fields, description: 'Updated' } } },
      []
    );
    expect(result.conflicts).toEqual([]);
    expect(result.records.c.fields).toEqual({ name: 'New', description: 'Updated' });
  });
  it('keeps delete/update and add/add conflicts explicit and supports reviewed deletion', () => {
    const target = { c: { ...base.c, fields: { name: 'Changed' } } };
    expect(mergeRecords(base, {}, target, []).conflicts[0].key).toBe('c/$record');
    expect(mergeRecords(base, {}, target, [{ key: 'c/$record', choice: 'source' }]).records).toEqual({});
    expect(mergeRecords({}, base, target, []).conflicts).toHaveLength(1);
    expect(mergeRecords({}, base, target, [{ key: 'c/$record', choice: 'custom', value: null }]).records).toEqual({});
  });
  it('rejects invented, duplicate and invalid conflict choices', () => {
    expect(() => mergeRecords(base, base, base, [{ key: 'c/name', choice: 'custom', value: 'spoof' }])).toThrow(/位置/);
    const choices = [{ key: 'c/$record', choice: 'source' as const }];
    expect(() => mergeRecords({}, base, { c: { ...base.c, fields: {} } }, [...choices, ...choices])).toThrow(/重复/);
    expect(() =>
      mergeRecords({}, base, { c: { ...base.c, fields: {} } }, [
        { key: 'c/$record', choice: 'custom', value: { entity: 'AssetCategory', fields: { unexpected: 'x' } } }
      ])
    ).toThrow(/字段/);
  });
  it('checks uniqueness across merged rows, foreign keys, mandatory values, finite amounts and dates', () => {
    const records: Records = {
      ...base,
      duplicate: { ...base.c },
      a: { entity: 'Asset', fields: { name: 'Asset', categoryId: 'missing', purchasePrice: -1 } },
      e: { entity: 'AssetEvent', fields: { summary: '', assetId: 'missing', happenedAt: 'invalid' } }
    };
    const checks = checkRecords(records);
    expect(checks.some(c => c.message.includes('唯一'))).toBe(true);
    expect(checks.filter(c => c.message.includes('关联'))).toHaveLength(2);
    expect(checks.some(c => c.field === 'purchasePrice')).toBe(true);
    expect(checks.some(c => c.field === 'happenedAt')).toBe(true);
    expect(() => assertRecords(JSON.parse('{"__proto__":{"entity":"AssetCategory","fields":{}}}'))).toThrow();
  });
  it('strictly rejects untrusted command shapes, forged subjects and prototype keys', () => {
    expect(() =>
      parseCommand({ type: 'task', operationId: 'op', id: 'id', name: 'Task', expectedHead: null, userId: 'admin' })
    ).toThrow();
    expect(() =>
      parseCommand({ type: 'task', operationId: 'op', id: '__proto__', name: 'Task', expectedHead: null })
    ).toThrow();
    expect(() =>
      parseCommand({
        type: 'upload',
        operationId: 'op',
        taskId: 'task',
        expectedHead: null,
        commits: [
          {
            id: 'c',
            parent: null,
            authorId: 'user',
            message: 'Message',
            records: { c: { entity: 'AssetCategory', fields: { name: {} } } }
          }
        ]
      })
    ).toThrow();
    expect(parseCommand({ type: 'task', operationId: 'op', id: 'id', name: 'Task', expectedHead: null }).type).toBe(
      'task'
    );
  });
});
