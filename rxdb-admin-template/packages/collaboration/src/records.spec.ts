import { describe, expect, it } from 'vitest';
import { checkRecords } from './checks.js';
import { taskCommit } from './commit.testing.js';
import type { Records, Resolution } from './model.js';
import { assertRecords, canonical, mergeRecords as merge3, sortRecords } from './records.js';
import { assertRecordsFit, systemFieldOf } from './schema.js';
import { assetSchema, diffAssets } from './schema.testing.js';
import { parseCommand } from './server/input.js';
/** 资产清单下的三方合并：系统字段按清单认出。 */
const mergeRecords = (base: Records, source: Records, target: Records, resolutions: Resolution[]) =>
  merge3(base, source, target, resolutions, systemFieldOf(assetSchema));
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
  it('system fields never conflict: each side keeps its own bookkeeping, the merge takes the changed side', () => {
    const row = (name: string, description: string, updatedAt: string, updatedBy: string) => ({
      entity: 'AssetCategory' as const,
      fields: { name, description, createdAt: 't0', updatedAt, createdBy: 'u0', updatedBy }
    });
    const original = { c: row('电脑', '旧', 't0', 'u0') };
    // 两台设备各改一个字段，working-tree 的单元都带着自己那一刻的 updatedAt / updatedBy
    const result = mergeRecords(
      original,
      { c: row('台式机', '旧', 't1', 'u1') },
      { c: row('电脑', '新', 't2', 'u2') },
      []
    );
    expect(result.conflicts).toEqual([]);
    expect(result.records.c.fields).toEqual({
      name: '台式机',
      description: '新',
      createdAt: 't0',
      updatedAt: 't1',
      createdBy: 'u0',
      updatedBy: 'u1'
    });
    // 记录级判断只看业务字段：目标只动了簿记字段时，来源的删除不算冲突
    expect(mergeRecords(original, {}, { c: row('电脑', '旧', 't2', 'u2') }, [])).toEqual({
      records: {},
      conflicts: []
    });
    // 同一个业务字段两边改得不一样，照旧是冲突
    expect(
      mergeRecords(
        original,
        { c: row('台式机', '旧', 't1', 'u1') },
        { c: row('笔记本', '旧', 't2', 'u2') },
        []
      ).conflicts.map(conflict => conflict.key)
    ).toEqual(['c/name']);
  });
  it('accepts an upload of exchange records with the platform content fingerprint and rejects anything else', () => {
    const commit = taskCommit({
      id: 'c',
      parent: 'root',
      authorId: 'user',
      message: 'Message',
      changes: diffAssets({}, { c: { entity: 'AssetCategory', fields: { name: 'Laptops' } } })
    });
    const upload = (value: unknown) =>
      parseCommand({ type: 'upload', operationId: 'op', taskId: 'task', expectedHead: 'root', commits: [value] });
    expect(upload(commit).type).toBe('upload');
    for (const invalid of [
      { ...commit, contentFingerprint: 'abc' },
      { ...commit, contentFingerprint: commit.contentFingerprint.toUpperCase() },
      { ...commit, contentFingerprint: undefined },
      { ...commit, units: undefined },
      { ...commit, units: [{ ...commit.units[0], patch: { name: {} } }] },
      { ...commit, units: [{ ...commit.units[0], operation: 'upsert' }] },
      { ...commit, records: { c: { entity: 'AssetCategory', fields: { name: 'Laptops' } } } },
      { ...commit, candidateId: 'candidate' }
    ])
      expect(() => upload(invalid), JSON.stringify(invalid)).toThrow();
  });
  it('strictly rejects untrusted command shapes, forged subjects and prototype keys', () => {
    expect(() =>
      parseCommand({ type: 'task', operationId: 'op', id: 'id', name: 'Task', expectedHead: 'root', userId: 'admin' })
    ).toThrow();
    expect(() =>
      parseCommand({ type: 'task', operationId: 'op', id: '__proto__', name: 'Task', expectedHead: 'root' })
    ).toThrow();
    // 共享分支有根之后头不会为空：期望的头必须是提交标识
    expect(() =>
      parseCommand({ type: 'task', operationId: 'op', id: 'id', name: 'Task', expectedHead: null })
    ).toThrow();
    expect(() =>
      parseCommand({
        type: 'upload',
        operationId: 'op',
        taskId: 'task',
        expectedHead: 'root',
        commits: [
          {
            commitId: 'c',
            parentIds: ['root'],
            kind: 'normal',
            authorId: 'user',
            message: 'Message',
            createdAt: '2026-11-18T00:00:00.000Z',
            contentFingerprint: 'f'.repeat(64),
            units: [
              {
                unitId: 'u',
                transactionId: null,
                namespace: 'assets',
                entity: 'AssetCategory',
                entityId: 'c',
                operation: 'insert',
                patch: { name: {} },
                inversePatch: null,
                origin: 'local'
              }
            ]
          }
        ]
      })
    ).toThrow();
    expect(parseCommand({ type: 'task', operationId: 'op', id: 'id', name: 'Task', expectedHead: 'root' }).type).toBe(
      'task'
    );
  });
});
