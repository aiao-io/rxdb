import { describe, expect, it } from 'vitest';
import type { Records } from './model.js';
import { assertRecords, checkRecords, mergeRecords } from './records.js';
import { parseCommand } from './server/input.js';
const base: Records = { c: { entity: 'AssetCategory', fields: { name: 'Category', description: 'Old' } } };
const describeChecks = (records: Records) =>
  checkRecords(records).map(check => `${check.recordId}.${check.field}: ${check.message}`);
describe('three-way data contract', () => {
  it('exposes deletion of a parent against a concurrent child edit and checks the chosen final references', () => {
    const original: Records = {
      ...base,
      a: { entity: 'Asset', fields: { name: 'Asset', categoryId: 'c', purchasePrice: 100 } }
    };
    const edited: Records = { ...original, a: { ...original.a, fields: { ...original.a.fields, purchasePrice: 120 } } };
    const preview = mergeRecords(original, {}, edited, []);
    expect(preview.conflicts.map(conflict => conflict.key)).toContain('a/$record');
    const keptChild = mergeRecords(original, {}, edited, [{ key: 'a/$record', choice: 'target' }]);
    expect(keptChild.records.a.fields['purchasePrice']).toBe(120);
    expect(checkRecords(keptChild.records)).toContainEqual(
      expect.objectContaining({ recordId: 'a', field: 'categoryId' })
    );
    expect(mergeRecords(original, {}, edited, [{ key: 'a/$record', choice: 'source' }]).records).toEqual({});
  });
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
  it('reports a missing, null or blank name only as missing, never as a duplicate of other unnamed rows', () => {
    const issues = describeChecks({
      c: base.c,
      absent1: { entity: 'Asset', fields: { categoryId: 'c' } },
      absent2: { entity: 'Asset', fields: { categoryId: 'c' } },
      nulled1: { entity: 'Asset', fields: { name: null, categoryId: 'c' } },
      nulled2: { entity: 'Asset', fields: { name: null, categoryId: 'c' } },
      blank1: { entity: 'Asset', fields: { name: '  ', categoryId: 'c' } },
      blank2: { entity: 'Asset', fields: { name: '  ', categoryId: 'c' } },
      bareCategory1: { entity: 'AssetCategory', fields: {} },
      bareCategory2: { entity: 'AssetCategory', fields: {} }
    });
    expect(issues).toEqual([
      'absent1.name: 必填文本不能为空',
      'absent2.name: 必填文本不能为空',
      'nulled1.name: 必填文本不能为空',
      'nulled2.name: 必填文本不能为空',
      'blank1.name: 必填文本不能为空',
      'blank2.name: 必填文本不能为空',
      'bareCategory1.name: 必填文本不能为空',
      'bareCategory2.name: 必填文本不能为空'
    ]);
  });
  it('still reports a real duplicate name once, and unnamed rows never poison later named ones', () => {
    const issues = describeChecks({
      c: base.c,
      absent: { entity: 'Asset', fields: { categoryId: 'c' } },
      first: { entity: 'Asset', fields: { name: 'Laptop', categoryId: 'c' } },
      second: { entity: 'Asset', fields: { name: 'Laptop', categoryId: 'c' } },
      third: { entity: 'Asset', fields: { name: 'Monitor', categoryId: 'c' } }
    });
    expect(issues).toEqual(['absent.name: 必填文本不能为空', 'second.name: 名称必须唯一']);
  });
  it('treats a missing, null or non-string reference as dangling without looking up its string form', () => {
    const issues = describeChecks({
      7: { entity: 'AssetCategory', fields: { name: 'Category whose id looks numeric' } },
      null: { entity: 'AssetCategory', fields: { name: 'Category whose id is the word null' } },
      undefined: { entity: 'AssetCategory', fields: { name: 'Category whose id is the word undefined' } },
      nulled: { entity: 'Asset', fields: { name: 'Nulled', categoryId: null } },
      absent: { entity: 'Asset', fields: { name: 'Absent' } },
      numeric: { entity: 'Asset', fields: { name: 'Numeric', categoryId: 7 } },
      event: { entity: 'AssetEvent', fields: { summary: 'Event', happenedAt: '2026-01-01', assetId: null } }
    });
    expect(issues).toEqual([
      'nulled.categoryId: 关联记录不存在',
      'absent.categoryId: 关联记录不存在',
      'numeric.categoryId: 关联记录不存在',
      'numeric.categoryId: 必须为文本',
      'event.assetId: 关联记录不存在'
    ]);
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
