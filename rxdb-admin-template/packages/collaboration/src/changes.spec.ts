import { describe, expect, it } from 'vitest';
import { applyChanges, applyVerified, diffRecords, revertChanges } from './changes.js';
import type { ChangeSet, Records } from './model.js';
import { randomEdit, seeded } from './random.testing.js';
import { canonical } from './records.js';
import { schemaModel } from './schema.js';
import { assetSchema, diffAssets } from './schema.testing.js';

const category = (name: string, extra: Record<string, string | number | boolean | null> = {}) => ({
  entity: 'AssetCategory' as const,
  fields: { name, ...extra }
});
const same = (a: unknown, b: unknown) => expect(canonical(a)).toBe(canonical(b));

describe('field-level change sets', () => {
  it('fills each change with the namespace the schema gives its entity', () => {
    const namespaces = (entity: string) => `${entity.toLowerCase()}-space`;
    expect(
      diffRecords({ a: category('A') }, { b: { entity: 'Asset', fields: {} } }, namespaces).map(
        change => change.namespace
      )
    ).toEqual(['assetcategory-space', 'asset-space']);
    expect(() => diffAssets({}, { x: { entity: 'Project', fields: {} } })).toThrow('实体不受支持');
  });
  it('describes an insert with the whole row and no inverse', () => {
    expect(diffAssets({}, { c: category('Computers', { description: null }) })).toEqual([
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
    expect(diffAssets({ c: category('Computers') }, {})).toEqual([
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
    expect(diffAssets(before, after)).toEqual([
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
    const added = diffAssets(bare, emptied);
    expect(added).toMatchObject([{ operation: 'update', patch: { description: null }, inversePatch: {} }]);
    expect(diffAssets(emptied, bare)).toMatchObject([
      { operation: 'update', patch: {}, inversePatch: { description: null } }
    ]);
    same(applyChanges(structuredClone(bare), added), emptied);
    same(revertChanges(structuredClone(emptied), added), bare);
  });
  it('emits nothing for equal records and orders changes by record id', () => {
    const rows: Records = { b: category('B'), a: category('A') };
    expect(diffAssets(rows, structuredClone(rows))).toEqual([]);
    expect(diffAssets({}, rows).map(change => change.entityId)).toEqual(['a', 'b']);
  });
  it('replaces a record whose entity changed by a delete followed by an insert', () => {
    const before: Records = { x: category('Same name') };
    const after: Records = { x: { entity: 'Asset', fields: { name: 'Same name' } } };
    const changes = diffAssets(before, after);
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
    const steps = [diffAssets(first, second), diffAssets(second, third), diffAssets(third, fourth)];
    const forward = applyChanges(structuredClone(first), steps.flat());
    same(forward, fourth);
    same(revertChanges(structuredClone(fourth), steps.flat()), first);
  });
  it('replaying random edit sequences reproduces every snapshot, forwards and backwards', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const next = seeded(seed);
      let serial = 0;
      const snapshots: Records[] = [{}];
      for (let step = 0; step < 25; step++) snapshots.push(randomEdit(next, snapshots.at(-1)!, () => ++serial));
      const commits = snapshots.slice(1).map((after, index) => diffAssets(snapshots[index], after));
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
    const insert = diffAssets({}, { c: category('One') });
    const update = diffAssets({ c: category('One') }, { c: category('Two') });
    const remove = diffAssets({ c: category('One') }, {});
    expect(() => applyChanges({ c: category('One') }, insert)).toThrow(/父提交/);
    expect(() => applyChanges({}, update)).toThrow(/父提交/);
    expect(() => applyChanges({}, remove)).toThrow(/父提交/);
    expect(() => revertChanges({}, insert)).toThrow(/父提交/);
    expect(() => revertChanges({}, update)).toThrow(/父提交/);
    expect(() => revertChanges({ c: category('One') }, remove)).toThrow(/父提交/);
  });
  it('treats a row of another entity as a mismatch rather than editing it', () => {
    const update = diffAssets({ c: category('One') }, { c: category('Two') });
    expect(() => applyChanges({ c: { entity: 'Asset', fields: { name: 'One' } } }, update)).toThrow(/父提交/);
  });
});

describe('verified application of uploaded change sets', () => {
  const model = schemaModel(assetSchema);
  const parent: Records = { c: category('One', { description: 'Old' }) };
  const update = (patch: Record<string, string | null>, inversePatch: Record<string, string | null>): ChangeSet => ({
    namespace: 'assets',
    entity: 'AssetCategory',
    entityId: 'c',
    operation: 'update',
    patch,
    inversePatch
  });
  it('applies changes that fit the parent content, in order, the same way as applyChanges', () => {
    const after: Records = { c: category('Two'), d: category('New') };
    const changes = diffAssets(parent, after);
    same(applyVerified(structuredClone(parent), changes, model), after);
    same(applyVerified(structuredClone(parent), changes, model), applyChanges(structuredClone(parent), changes));
    const twice = [...diffAssets(parent, after), ...diffAssets(after, {})];
    same(applyVerified(structuredClone(parent), twice, model), {});
  });
  it('rejects an insert of an existing record, and an update or delete of a missing one or of another entity', () => {
    expect(() => applyVerified(structuredClone(parent), diffAssets({}, { c: category('One') }), model)).toThrow(
      /父提交/
    );
    expect(() => applyVerified({}, [update({ name: 'Two' }, { name: 'One' })], model)).toThrow(/父提交/);
    expect(() => applyVerified({}, diffAssets(parent, {}), model)).toThrow(/父提交/);
    const asset: Records = { c: { entity: 'Asset', fields: { name: 'One', description: 'Old' } } };
    expect(() => applyVerified(asset, [update({ name: 'Two' }, { name: 'One' })], model)).toThrow(/父提交/);
  });
  it('requires the inverse of an update to match the old values, and newly added fields to be absent', () => {
    expect(() => applyVerified(structuredClone(parent), [update({ name: 'Two' }, { name: 'Zero' })], model)).toThrow(
      /父提交/
    );
    expect(() => applyVerified(structuredClone(parent), [update({}, { status: 'gone' })], model)).toThrow(/父提交/);
    expect(() => applyVerified(structuredClone(parent), [update({ description: 'New' }, {})], model)).toThrow(/父提交/);
    same(applyVerified(structuredClone(parent), [update({ status: 'added' }, {})], model), {
      c: category('One', { description: 'Old', status: 'added' })
    });
    same(applyVerified(structuredClone(parent), [update({}, { description: 'Old' })], model), { c: category('One') });
  });
  it('requires the inverse of a delete to be the whole old row', () => {
    const partial: ChangeSet = { ...diffAssets(parent, {})[0], inversePatch: { name: 'One' } };
    const altered: ChangeSet = { ...diffAssets(parent, {})[0], inversePatch: { name: 'One', description: 'New' } };
    for (const change of [partial, altered])
      expect(() => applyVerified(structuredClone(parent), [change], model)).toThrow(/父提交/);
    same(applyVerified(structuredClone(parent), diffAssets(parent, {}), model), {});
  });
});

describe('verification reads the stored form of working-tree units (sqlite-wasm)', () => {
  const model = schemaModel(assetSchema);
  /** 服务端记录：IndexedDB 客户端写下的，没有系统字段，也没有写过的可空字段（说明）。 */
  const server: Records = { c: category('电脑') };
  /** 另一台设备导入后在本机业务表上的那一行：每一列都在，审计时间与主体是那台设备自己的。 */
  const device = {
    name: '电脑',
    description: null,
    createdAt: '2026-11-18T01:00:00.000Z',
    updatedAt: '2026-11-18T01:00:00.000Z',
    createdBy: null,
    updatedBy: null
  };
  const unit = (
    operation: ChangeSet['operation'],
    patch: ChangeSet['patch'],
    inversePatch: ChangeSet['inversePatch']
  ) => ({ namespace: 'assets', entity: 'AssetCategory', entityId: 'c', operation, patch, inversePatch }) as ChangeSet;
  it('does not compare system fields: bookkeeping differs between devices and the server keeps what the unit says', () => {
    const edited = unit(
      'update',
      { description: '台式机', updatedAt: '2026-11-18T02:00:00.000Z', updatedBy: 'user-2' },
      { description: null, updatedAt: '2026-11-18T01:00:00.000Z', updatedBy: null }
    );
    same(applyVerified(structuredClone(server), [edited], model), {
      c: category('电脑', { description: '台式机', updatedAt: '2026-11-18T02:00:00.000Z', updatedBy: 'user-2' })
    });
  });
  it('reads a field the record does not have as NULL, like the column it is on a device', () => {
    same(applyVerified(structuredClone(server), [unit('delete', null, device)], model), {});
    expect(() =>
      applyVerified(structuredClone(server), [unit('delete', null, { ...device, description: '别的' })], model)
    ).toThrow(/父提交/);
    expect(() =>
      applyVerified(
        structuredClone(server),
        [unit('update', { name: '笔记本' }, { name: '台式机', updatedAt: device.updatedAt })],
        model
      )
    ).toThrow(/父提交/);
  });
  it('keeps the new value of every field, system fields included, when inserting a whole captured row', () => {
    const inserted = { ...unit('insert', device, null), entityId: 'd' };
    same(applyVerified(structuredClone(server), [inserted], model), {
      ...server,
      d: { entity: 'AssetCategory', fields: device }
    });
  });
});
