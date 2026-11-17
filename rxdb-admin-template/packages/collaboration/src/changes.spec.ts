import { describe, expect, it } from 'vitest';
import { applyChanges, diffRecords, revertChanges } from './changes.js';
import type { ChangeSet, Records } from './model.js';
import { randomEdit, seeded } from './random.testing.js';
import { assertChanges, canonical } from './records.js';

const category = (name: string, extra: Record<string, string | number | boolean | null> = {}) => ({
  entity: 'AssetCategory' as const,
  fields: { name, ...extra }
});
const same = (a: unknown, b: unknown) => expect(canonical(a)).toBe(canonical(b));

describe('field-level change sets', () => {
  it('describes an insert with the whole row and no inverse', () => {
    expect(diffRecords({}, { c: category('Computers', { description: null }) })).toEqual([
      {
        namespace: 'assets',
        entity: 'AssetCategory',
        entityId: 'c',
        operation: 'insert',
        patch: { name: 'Computers', description: null },
        inversePatch: null
      }
    ]);
  });
  it('describes a delete with no patch and the whole row as the inverse', () => {
    expect(diffRecords({ c: category('Computers') }, {})).toEqual([
      {
        namespace: 'assets',
        entity: 'AssetCategory',
        entityId: 'c',
        operation: 'delete',
        patch: null,
        inversePatch: { name: 'Computers' }
      }
    ]);
  });
  it('describes an update by the changed fields only, with their old values as the inverse', () => {
    const before: Records = { c: category('Computers', { description: 'Old' }) };
    const after: Records = { c: category('Computers', { description: 'New' }) };
    expect(diffRecords(before, after)).toEqual([
      {
        namespace: 'assets',
        entity: 'AssetCategory',
        entityId: 'c',
        operation: 'update',
        patch: { description: 'New' },
        inversePatch: { description: 'Old' }
      }
    ]);
  });
  it('tells a field that was added or removed apart from one that was set to null', () => {
    const bare: Records = { c: category('Computers') };
    const emptied: Records = { c: category('Computers', { description: null }) };
    const added = diffRecords(bare, emptied);
    expect(added).toMatchObject([{ operation: 'update', patch: { description: null }, inversePatch: {} }]);
    expect(diffRecords(emptied, bare)).toMatchObject([
      { operation: 'update', patch: {}, inversePatch: { description: null } }
    ]);
    same(applyChanges(structuredClone(bare), added), emptied);
    same(revertChanges(structuredClone(emptied), added), bare);
  });
  it('emits nothing for equal records and orders changes by record id', () => {
    const rows: Records = { b: category('B'), a: category('A') };
    expect(diffRecords(rows, structuredClone(rows))).toEqual([]);
    expect(diffRecords({}, rows).map(change => change.entityId)).toEqual(['a', 'b']);
  });
  it('replaces a record whose entity changed by a delete followed by an insert', () => {
    const before: Records = { x: category('Same name') };
    const after: Records = { x: { entity: 'Asset', fields: { name: 'Same name' } } };
    const changes = diffRecords(before, after);
    expect(changes.map(change => [change.entityId, change.operation])).toEqual([
      ['x', 'delete'],
      ['x', 'insert']
    ]);
    same(applyChanges(structuredClone(before), changes), after);
    same(revertChanges(structuredClone(after), changes), before);
  });
  it('applies and reverts several edits of the same record in order', () => {
    const first: Records = { c: category('One') };
    const second: Records = { c: category('Two', { description: 'x' }) };
    const third: Records = {};
    const fourth: Records = { c: category('Back') };
    const steps = [diffRecords(first, second), diffRecords(second, third), diffRecords(third, fourth)];
    const forward = applyChanges(structuredClone(first), steps.flat());
    same(forward, fourth);
    same(revertChanges(structuredClone(fourth), steps.flat()), first);
  });
  it('replaying random edit sequences reproduces every snapshot, forwards and backwards', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const next = seeded(seed);
      let serial = 0;
      const snapshots: Records[] = [{}];
      for (let step = 0; step < 25; step++)
        snapshots.push(randomEdit(next, snapshots.at(-1)!, () => ++serial));
      const commits = snapshots.slice(1).map((after, index) => diffRecords(snapshots[index], after));
      let replay: Records = {};
      commits.forEach((changes, index) => {
        replay = applyChanges(replay, changes);
        same(replay, snapshots[index + 1]);
      });
      // 把整段提交串成一份变更，同一记录被多次修改也必须得到同样的结果
      same(applyChanges({}, commits.flat()), snapshots.at(-1));
      let rewind = structuredClone(snapshots.at(-1)!);
      for (const changes of [...commits].reverse()) rewind = revertChanges(rewind, changes);
      same(rewind, snapshots[0]);
    }
  });
  it('refuses to apply a change that does not fit the content it is applied to', () => {
    const insert = diffRecords({}, { c: category('One') });
    const update = diffRecords({ c: category('One') }, { c: category('Two') });
    const remove = diffRecords({ c: category('One') }, {});
    expect(() => applyChanges({ c: category('One') }, insert)).toThrow(/父提交/);
    expect(() => applyChanges({}, update)).toThrow(/父提交/);
    expect(() => applyChanges({}, remove)).toThrow(/父提交/);
    expect(() => revertChanges({}, insert)).toThrow(/父提交/);
    expect(() => revertChanges({}, update)).toThrow(/父提交/);
    expect(() => revertChanges({ c: category('One') }, remove)).toThrow(/父提交/);
  });
  it('treats a row of another entity as a mismatch rather than editing it', () => {
    const update = diffRecords({ c: category('One') }, { c: category('Two') });
    expect(() => applyChanges({ c: { entity: 'Asset', fields: { name: 'One' } } }, update)).toThrow(/父提交/);
  });
});

describe('change set validation of untrusted input', () => {
  const insert: ChangeSet = {
    namespace: 'assets',
    entity: 'AssetCategory',
    entityId: 'c',
    operation: 'insert',
    patch: { name: 'x' },
    inversePatch: null
  };
  const update: ChangeSet = { ...insert, operation: 'update', patch: { name: 'y' }, inversePatch: { name: 'x' } };
  const remove: ChangeSet = { ...insert, operation: 'delete', patch: null, inversePatch: { name: 'x' } };
  it('accepts the three well-formed operations', () => {
    expect(() => assertChanges([insert, update, remove])).not.toThrow();
    expect(() => assertChanges([])).not.toThrow();
  });
  it('requires the exact shape of each operation', () => {
    const bad: unknown[] = [
      { ...insert, patch: null },
      { ...insert, inversePatch: { name: 'x' } },
      { ...update, patch: null },
      { ...update, inversePatch: null },
      { ...remove, patch: { name: 'x' } },
      { ...remove, inversePatch: null },
      { ...insert, operation: 'upsert' },
      { ...insert, extra: true },
      { ...insert, namespace: 'other' },
      { ...insert, entity: 'Unknown' },
      { ...insert, entityId: '__proto__' },
      { ...insert, entityId: 'a b' },
      { namespace: 'assets', entity: 'AssetCategory', entityId: 'c', operation: 'insert', patch: { name: 'x' } },
      'text',
      null,
      [insert]
    ];
    for (const change of bad) expect(() => assertChanges([change]), JSON.stringify(change)).toThrow();
    expect(() => assertChanges('not a list')).toThrow();
    expect(() => assertChanges({ 0: insert })).toThrow();
  });
  it('validates every patched field like a whole row', () => {
    expect(() => assertChanges([{ ...insert, patch: { unknown: 'x' } }])).toThrow(/字段/);
    expect(() => assertChanges([{ ...insert, patch: { name: {} } }])).toThrow(/字段/);
    expect(() => assertChanges([{ ...insert, patch: { name: Number.POSITIVE_INFINITY } }])).toThrow(/有限/);
    expect(() => assertChanges([{ ...insert, patch: { name: 'x'.repeat(10001) } }])).toThrow(/过长/);
    expect(() => assertChanges([{ ...remove, inversePatch: { unknown: 'x' } }])).toThrow(/字段/);
  });
  it('caps the number of changes in one commit', () => {
    expect(() => assertChanges(Array.from({ length: 10000 }, () => insert))).not.toThrow();
    expect(() => assertChanges(Array.from({ length: 10001 }, () => insert))).toThrow(/10000/);
  });
});
