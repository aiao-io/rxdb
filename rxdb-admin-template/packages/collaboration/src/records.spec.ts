import { describe, expect, it } from 'vitest';
import { checkRecords } from './checks.js';
import { sealCommit } from './commit.js';
import type { Records } from './model.js';
import { assertRecords, canonical, mergeRecords, sortRecords } from './records.js';
import { assertRecordsFit } from './schema.js';
import { assetSchema, diffAssets } from './schema.testing.js';
import { parseCommand } from './server/input.js';
const base: Records = { c: { entity: 'AssetCategory', fields: { name: 'Category', description: 'Old' } } };
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
    expect(checkRecords(assetSchema, keptChild.records)).toContainEqual(
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
        { key: 'c/$record', choice: 'custom', value: { entity: 'AssetCategory', fields: { 'bad-field': 'x' } } }
      ])
    ).toThrow(/字段/);
  });
  it('checks only the record shape itself; entities and fields of a custom record are checked against the schema', () => {
    const custom = mergeRecords({}, base, { c: { ...base.c, fields: {} } }, [
      { key: 'c/$record', choice: 'custom', value: { entity: 'AssetCategory', fields: { unexpected: 'x' } } }
    ]);
    expect(() => assertRecordsFit(assetSchema, custom.records)).toThrow('字段不受支持');
    expect(() => assertRecords(JSON.parse('{"__proto__":{"entity":"AssetCategory","fields":{}}}'))).toThrow();
    expect(() => assertRecords({ c: { entity: 'not an entity', fields: {} } })).toThrow('实体不受支持');
  });
  it('orders conflicts and merged rows by record and field id, whatever the key order of the three sides', () => {
    const row = (name: string, description: string) => ({
      entity: 'AssetCategory' as const,
      fields: { name, description }
    });
    const ids = ['m', 'b', 'z', 'a'];
    const side = (name: string, description: string, order: string[]): Records =>
      Object.fromEntries(order.map(id => [id, row(`${name}-${id}`, description)]));
    const merge = (order: string[]) =>
      mergeRecords(side('x', 'old', order), side('y', 'new', order), side('z', 'other', [...order].reverse()), []);
    const forward = merge(ids);
    const backward = merge([...ids].reverse());
    expect(forward.conflicts.map(conflict => conflict.key)).toEqual(
      ['a', 'b', 'm', 'z'].flatMap(id => [`${id}/description`, `${id}/name`])
    );
    expect(canonical(backward.conflicts)).toBe(canonical(forward.conflicts));
    expect(Object.keys(forward.records)).toEqual(['a', 'b', 'm', 'z']);
    expect(Object.keys(sortRecords({ b: row('B', ''), a: row('A', '') }))).toEqual(['a', 'b']);
  });
  it('accepts an upload of field-level changes with a SHA-256 fingerprint and rejects anything else', async () => {
    const commit = await sealCommit({
      id: 'c',
      parent: null,
      authorId: 'user',
      message: 'Message',
      changes: diffAssets({}, { c: { entity: 'AssetCategory', fields: { name: 'Laptops' } } })
    });
    const upload = (value: unknown) =>
      parseCommand({ type: 'upload', operationId: 'op', taskId: 'task', expectedHead: null, commits: [value] });
    expect(upload(commit).type).toBe('upload');
    for (const invalid of [
      { ...commit, fingerprint: 'abc' },
      { ...commit, fingerprint: commit.fingerprint.toUpperCase() },
      { ...commit, fingerprint: undefined },
      { ...commit, changes: undefined },
      { ...commit, changes: [{ ...commit.changes[0], patch: { name: {} } }] },
      { ...commit, changes: [{ ...commit.changes[0], operation: 'upsert' }] },
      { ...commit, records: { c: { entity: 'AssetCategory', fields: { name: 'Laptops' } } } },
      { ...commit, mergeSource: 'source', candidateId: 'candidate' }
    ])
      expect(() => upload(invalid), JSON.stringify(invalid)).toThrow();
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
            fingerprint: 'f'.repeat(64),
            changes: [
              {
                namespace: 'assets',
                entity: 'AssetCategory',
                entityId: 'c',
                operation: 'insert',
                patch: { name: {} },
                inversePatch: null
              }
            ]
          }
        ]
      })
    ).toThrow();
    expect(parseCommand({ type: 'task', operationId: 'op', id: 'id', name: 'Task', expectedHead: null }).type).toBe(
      'task'
    );
  });
});
