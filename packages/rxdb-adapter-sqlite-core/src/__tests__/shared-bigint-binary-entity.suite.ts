import {
  Entity,
  EntityBase,
  getEntityMetadata,
  getEntityStatus,
  OnDeleteAction,
  PropertyType,
  RelationKind
} from '@aiao/rxdb';
import { filter, firstValueFrom } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import type { AdapterFactory } from './adapter-factory.js';

const NAMESPACE = 'bigint-entity-contract';
/** 索引名 = `idx_<namespace>$<tableName>_<indexName>`（SQLC-021） */
const TYPED_VALUES_INDEX = `idx_${NAMESPACE}$bigint_entity_contract_parent_typed_values`;
let binaryFactoryCalls = 0;

const createBinaryDefault = (): Uint8Array => {
  binaryFactoryCalls += 1;
  return new Uint8Array([3, 4]);
};

@Entity({
  namespace: NAMESPACE,
  name: 'BigIntEntityContractParent',
  tableName: 'bigint_entity_contract_parent',
  log: true,
  properties: [
    { name: 'id', type: PropertyType.bigint, primary: true },
    { name: 'rank', type: PropertyType.integer, sortable: true },
    { name: 'amount', type: PropertyType.bigint, sortable: true },
    { name: 'payload', type: PropertyType.binary },
    { name: 'constantPayload', type: PropertyType.binary, default: new Uint8Array([1, 2]) },
    { name: 'generatedPayload', type: PropertyType.binary, default: createBinaryDefault },
    { name: 'fixed', type: PropertyType.bigint, default: 7n }
  ],
  indexes: [{ name: 'typed_values', properties: ['amount', 'payload'] }],
  relations: [
    {
      name: 'children',
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'BigIntEntityContractChild',
      mappedProperty: 'parent'
    },
    {
      name: 'profile',
      kind: RelationKind.ONE_TO_ONE,
      mappedEntity: 'BigIntEntityContractProfile',
      mappedProperty: 'owner',
      nullable: true
    },
    {
      name: 'tags',
      kind: RelationKind.MANY_TO_MANY,
      mappedEntity: 'BigIntEntityContractTag',
      mappedProperty: 'parents'
    }
  ]
})
class BigIntEntityContractParent extends EntityBase<bigint> {
  declare id: bigint;
  rank!: number;
  amount!: bigint;
  payload!: Uint8Array;
  constantPayload!: Uint8Array;
  generatedPayload!: Uint8Array;
  fixed!: bigint;
}

@Entity({
  namespace: NAMESPACE,
  name: 'BigIntEntityContractChild',
  tableName: 'bigint_entity_contract_child',
  log: true,
  properties: [{ name: 'label', type: PropertyType.string }],
  relations: [
    {
      name: 'parent',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'BigIntEntityContractParent',
      mappedProperty: 'children',
      nullable: false,
      onDelete: OnDeleteAction.CASCADE
    }
  ]
})
class BigIntEntityContractChild extends EntityBase {
  label!: string;
  parentId!: bigint;
}

@Entity({
  namespace: NAMESPACE,
  name: 'BigIntEntityContractProfile',
  tableName: 'bigint_entity_contract_profile',
  properties: [{ name: 'label', type: PropertyType.string }],
  relations: [
    {
      name: 'owner',
      kind: RelationKind.ONE_TO_ONE,
      mappedEntity: 'BigIntEntityContractParent',
      mappedProperty: 'profile',
      nullable: false,
      onDelete: OnDeleteAction.CASCADE
    }
  ]
})
class BigIntEntityContractProfile extends EntityBase {
  label!: string;
  ownerId!: bigint;
}

@Entity({
  namespace: NAMESPACE,
  name: 'BigIntEntityContractTag',
  tableName: 'bigint_entity_contract_tag',
  properties: [
    { name: 'id', type: PropertyType.bigint, primary: true },
    { name: 'label', type: PropertyType.string }
  ],
  relations: [
    {
      name: 'parents',
      kind: RelationKind.MANY_TO_MANY,
      mappedEntity: 'BigIntEntityContractParent',
      mappedProperty: 'tags'
    }
  ]
})
class BigIntEntityContractTag extends EntityBase<bigint> {
  declare id: bigint;
  label!: string;
}

const emptyWhere = { combinator: 'and', rules: [] } as const;

/** bigint/binary 实体契约测试：通过实体 CRUD 验证 64 位整数与二进制往返。 */
export function bigintBinaryEntitySuite(factory: AdapterFactory): void {
  describe.sequential(`bigint/binary entity contract [${factory.name}]`, () => {
    let adapter: RxDBAdapterSqliteBase;

    beforeAll(async () => {
      adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({
        entities: [
          BigIntEntityContractParent,
          BigIntEntityContractChild,
          BigIntEntityContractProfile,
          BigIntEntityContractTag
        ]
      });
      await firstValueFrom(adapter.rxdb.versionManager.history().undoHistories$);
    });

    afterAll(async () => {
      if (adapter) await adapter.rxdb.disconnectAll();
    });

    it('round-trips entity values and paginates bigint ids without gaps', async () => {
      const ids = [9007199254740993n, 9007199254740994n, 9007199254740995n, 9007199254740996n];
      const source = new Uint8Array([9, 0, 255, 8]);
      const records = ids.map((id, index) => {
        const record = new BigIntEntityContractParent();
        record.id = id;
        record.rank = Math.floor(index / 2);
        record.amount = id;
        record.payload = index === 0 ? source.subarray(1, 3) : new Uint8Array([index]);
        return record;
      });

      await adapter.rxdb.entityManager.saveMany(records);
      source.fill(7);
      adapter.rxdb.entityManager.cleanAllCache();
      adapter.cleanAllCache();

      const orderBy = [
        { field: 'rank', sort: 'asc' as const },
        { field: 'id', sort: 'asc' as const }
      ];
      const first = await firstValueFrom(
        BigIntEntityContractParent.findByCursor({ where: emptyWhere, orderBy, limit: 2 })
      );
      const after = await firstValueFrom(
        BigIntEntityContractParent.findByCursor({ where: emptyWhere, orderBy, after: first[1], limit: 2 })
      );
      const before = await firstValueFrom(
        BigIntEntityContractParent.findByCursor({ where: emptyWhere, orderBy, before: after[0], limit: 2 })
      );

      expect(first.map(record => record.id)).toEqual(ids.slice(0, 2));
      expect(after.map(record => record.id)).toEqual(ids.slice(2));
      expect(before.map(record => record.id)).toEqual(ids.slice(0, 2));
      expect(first[0].amount).toBe(ids[0]);
      expect(first[0].payload).toEqual(new Uint8Array([0, 255]));
      expect(first[0].fixed).toBe(7n);
      expect(typeof first[0].id).toBe('bigint');
      expect(typeof first[0].amount).toBe('bigint');
    });

    it('isolates binary defaults, applies bigint database defaults and creates typed indexes', async () => {
      const callsBefore = binaryFactoryCalls;
      const first = new BigIntEntityContractParent();
      const second = new BigIntEntityContractParent();

      expect(binaryFactoryCalls).toBe(callsBefore + 2);
      expect(first.constantPayload).toEqual(new Uint8Array([1, 2]));
      expect(first.constantPayload).not.toBe(second.constantPayload);
      expect(first.generatedPayload).toEqual(new Uint8Array([3, 4]));
      expect(first.generatedPayload).not.toBe(second.generatedPayload);
      first.constantPayload[0] = 9;
      first.generatedPayload[0] = 9;
      expect(second.constantPayload).toEqual(new Uint8Array([1, 2]));
      expect(second.generatedPayload).toEqual(new Uint8Array([3, 4]));

      const directId = 9_007_199_254_741_000n;
      const now = new Date().toISOString();
      await adapter.transaction(client =>
        client.execute(
          `INSERT INTO "${NAMESPACE}$bigint_entity_contract_parent" (id, rank, amount, payload, constantPayload, generatedPayload, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
          [directId, 1000, directId, new Uint8Array([5]), new Uint8Array([1, 2]), new Uint8Array([3, 4]), now, now]
        )
      );
      adapter.rxdb.entityManager.cleanAllCache();
      adapter.cleanAllCache();
      const direct = await firstValueFrom(BigIntEntityContractParent.get(directId));
      expect(direct.fixed).toBe(7n);
      expect(typeof direct.fixed).toBe('bigint');

      const indexes = await adapter.transaction(client =>
        client.execute(`SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?;`, [
          // SQLC-021：索引名与表名同口径带 `namespace$` 前缀
          TYPED_VALUES_INDEX
        ])
      );
      expect(indexes.results[0].rows).toEqual([[TYPED_VALUES_INDEX]]);
    });

    it('hydrates bigint foreign keys and preserves cascade delete', async () => {
      const parentIds = [1n, 9_007_199_254_740_997n];
      const parents = parentIds.map((id, index) => {
        const parent = new BigIntEntityContractParent();
        parent.id = id;
        parent.rank = 10 + index;
        parent.amount = id;
        parent.payload = new Uint8Array([index + 1]);
        return parent;
      });
      await adapter.rxdb.entityManager.saveMany(parents);

      const children = parentIds.map((parentId, index) => {
        const child = new BigIntEntityContractChild();
        child.label = `child-${index}`;
        child.parentId = parentId;
        return child;
      });
      await adapter.rxdb.entityManager.saveMany(children);

      adapter.rxdb.entityManager.cleanAllCache();
      adapter.cleanAllCache();
      const restored = await Promise.all(
        children.map(child => firstValueFrom(BigIntEntityContractChild.get(child.id)))
      );
      expect(restored.map(child => child.parentId)).toEqual(parentIds);
      expect(restored.every(child => typeof child.parentId === 'bigint')).toBe(true);

      await adapter.rxdb.entityManager.removeMany(parents);
      const remaining = await firstValueFrom(BigIntEntityContractChild.findAll({ where: emptyWhere }));
      const childIds = new Set(children.map(child => child.id));
      expect(remaining.some(record => childIds.has(record.id))).toBe(false);
    });

    it('reads and replays unsafe bigint foreign-key change patches', async () => {
      const safeParentId = 2n;
      const unsafeParentId = 9_007_199_254_741_020n;
      const parents = [safeParentId, unsafeParentId].map((id, index) => {
        const parent = new BigIntEntityContractParent();
        parent.id = id;
        parent.rank = 1020 + index;
        parent.amount = id;
        parent.payload = new Uint8Array([index]);
        return parent;
      });
      await adapter.rxdb.entityManager.saveMany(parents);

      const child = new BigIntEntityContractChild();
      child.label = 'change-codec-child';
      child.parentId = unsafeParentId;
      await child.save();
      child.parentId = safeParentId;
      await child.save();

      const changes = await adapter.localRxDBChange().find({
        where: {
          combinator: 'and',
          rules: [{ field: 'entity', operator: '=', value: 'BigIntEntityContractChild' }]
        },
        orderBy: [{ field: 'id', sort: 'asc' }]
      });
      const childChanges = changes.filter(change => change.entityId === child.id);
      const inserted = childChanges.find(change => change.type === 'INSERT');
      const updated = childChanges.find(change => change.type === 'UPDATE');
      expect(inserted?.patch?.['parentId']).toBe(unsafeParentId);
      expect(updated?.inversePatch?.['parentId']).toBe(unsafeParentId);
      expect(updated?.patch?.['parentId']).toBe(safeParentId);

      const history = adapter.rxdb.versionManager.history(child);
      await firstValueFrom(history.undoHistories$);
      await history.undo();
      expect((await adapter.getRepository(BigIntEntityContractChild).get(child.id)).parentId).toBe(unsafeParentId);
      await history.redo();
      expect((await adapter.getRepository(BigIntEntityContractChild).get(child.id)).parentId).toBe(safeParentId);
    });

    it('keeps bigint keys through one-to-one and many-to-many entity APIs', async () => {
      const parent = new BigIntEntityContractParent();
      parent.id = 9_007_199_254_741_010n;
      parent.rank = 1010;
      parent.amount = parent.id;
      parent.payload = new Uint8Array([1]);
      await parent.save();

      const profile = new BigIntEntityContractProfile();
      profile.label = 'profile';
      profile.ownerId = parent.id;
      await profile.save();

      const tag = new BigIntEntityContractTag();
      tag.id = 9_007_199_254_741_011n;
      tag.label = 'tag';
      await tag.save();

      const tags$ = Reflect.get(parent, 'tags$') as import('rxjs').Observable<BigIntEntityContractTag[]> & {
        add: (...entities: BigIntEntityContractTag[]) => void;
      };
      tags$.add(tag);
      await parent.save();

      adapter.rxdb.entityManager.cleanAllCache();
      adapter.cleanAllCache();
      const restoredProfile = await firstValueFrom(BigIntEntityContractProfile.get(profile.id));
      const owner$ = Reflect.get(restoredProfile, 'owner$') as import('rxjs').Observable<
        BigIntEntityContractParent | undefined
      >;
      expect((await firstValueFrom(owner$))?.id).toBe(parent.id);
      expect(typeof restoredProfile.ownerId).toBe('bigint');

      const restoredParent = await firstValueFrom(BigIntEntityContractParent.get(parent.id));
      const restoredTags$ = Reflect.get(restoredParent, 'tags$') as import('rxjs').Observable<
        BigIntEntityContractTag[]
      >;
      expect((await firstValueFrom(restoredTags$)).map(entity => entity.id)).toEqual([tag.id]);

      const relation = getEntityMetadata(BigIntEntityContractParent).relationMap.get('tags');
      if (!relation || relation.kind !== RelationKind.MANY_TO_MANY) {
        throw new TypeError('SQLite bigint MANY_TO_MANY relation metadata is missing');
      }
      const junctions = await adapter.getRepository(relation.junctionEntityType).find({ where: emptyWhere });
      expect(junctions).toHaveLength(1);
      expect(Reflect.get(junctions[0], 'parentsId')).toBe(parent.id);
      expect(Reflect.get(junctions[0], 'tagsId')).toBe(tag.id);

      await restoredParent.remove();
      expect(await adapter.getRepository(relation.junctionEntityType).find({ where: emptyWhere })).toHaveLength(0);
      expect(
        await adapter.getRepository(BigIntEntityContractProfile).find({
          where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: profile.id }] }
        })
      ).toHaveLength(0);
    });

    it('records typed INSERT/UPDATE/DELETE changes through SQLite JSON1', async () => {
      const entityId = 9_007_199_254_740_993n;
      const repository = adapter.localRxDBChange();
      const findChanges = () =>
        repository.find({
          where: {
            combinator: 'and',
            rules: [{ field: 'entity', operator: '=', value: 'BigIntEntityContractParent' }]
          },
          orderBy: [{ field: 'id', sort: 'asc' }]
        });

      let changes = await findChanges();
      const inserted = changes.find(change => change.type === 'INSERT' && change.entityId === entityId);
      expect(inserted?.patch?.['amount']).toBe(entityId);
      expect(inserted?.patch?.['payload']).toEqual(new Uint8Array([0, 255]));

      const record = await adapter.getRepository(BigIntEntityContractParent).get(entityId);
      record.amount = 9_007_199_254_740_999n;
      record.payload = new Uint8Array([3, 4]);
      await record.save();
      changes = await findChanges();
      const updated = changes.find(change => change.type === 'UPDATE' && change.entityId === entityId);
      expect(updated?.patch?.['amount']).toBe(9_007_199_254_740_999n);
      expect(updated?.patch?.['payload']).toEqual(new Uint8Array([3, 4]));

      await record.remove();
      changes = await findChanges();
      const removed = changes.find(change => change.type === 'DELETE' && change.entityId === entityId);
      expect(removed?.inversePatch?.['amount']).toBe(9_007_199_254_740_999n);
      expect(removed?.inversePatch?.['payload']).toEqual(new Uint8Array([3, 4]));
    });

    it('keeps binary history snapshots isolated from later input mutations', async () => {
      const entityId = 9_007_199_254_741_101n;
      const source = new Uint8Array([1, 2]);
      const record = new BigIntEntityContractParent();
      record.id = entityId;
      record.rank = 101;
      record.amount = 101n;
      record.payload = source;
      await record.save();
      source.fill(9);

      const next = new Uint8Array([3, 4]);
      record.amount = 102n;
      record.payload = next;
      await record.save();
      next.fill(8);

      const changes = await adapter.localRxDBChange().find({
        where: {
          combinator: 'and',
          rules: [{ field: 'entity', operator: '=', value: 'BigIntEntityContractParent' }]
        },
        orderBy: [{ field: 'id', sort: 'asc' }]
      });
      const entityChanges = changes.filter(change => change.entityId === entityId);
      const inserted = entityChanges.find(change => change.type === 'INSERT');
      const updated = entityChanges.find(change => change.type === 'UPDATE');
      expect(inserted?.patch?.['payload']).toEqual(new Uint8Array([1, 2]));
      expect(updated?.patch?.['payload']).toEqual(new Uint8Array([3, 4]));
      expect(updated?.inversePatch?.['payload']).toEqual(new Uint8Array([1, 2]));

      const history = adapter.rxdb.versionManager.history(record);
      await firstValueFrom(
        history.undoHistories$.pipe(
          filter(histories =>
            histories.some(item =>
              item.changes.some(change => change.type === 'UPDATE' && change.entityId === entityId)
            )
          )
        )
      );
      await history.undo();
      adapter.rxdb.entityManager.cleanAllCache();
      adapter.cleanAllCache();
      const undone = await firstValueFrom(BigIntEntityContractParent.get(entityId));
      expect(undone.amount).toBe(101n);
      expect(undone.payload).toEqual(new Uint8Array([1, 2]));
      expect(undone.payload).toBeInstanceOf(Uint8Array);
    });

    it('ignores in-place binary mutation until the property is reassigned', async () => {
      const entityId = 9_007_199_254_741_102n;
      const record = new BigIntEntityContractParent();
      record.id = entityId;
      record.rank = 102;
      record.amount = 102n;
      record.payload = new Uint8Array([5, 6]);
      await record.save();

      const findEntityChanges = async () => {
        const changes = await adapter.localRxDBChange().find({
          where: {
            combinator: 'and',
            rules: [{ field: 'entity', operator: '=', value: 'BigIntEntityContractParent' }]
          },
          orderBy: [{ field: 'id', sort: 'asc' }]
        });
        return changes.filter(change => change.entityId === entityId);
      };
      expect(await findEntityChanges()).toHaveLength(1);

      record.payload[0] = 7;
      await record.save();
      expect(await findEntityChanges()).toHaveLength(1);

      record.payload = new Uint8Array([7, 6]);
      const status = getEntityStatus(record);
      expect(status.modified).toBe(true);
      expect(status.patch).toMatchObject({ payload: new Uint8Array([7, 6]) });
      await record.save();
      const changes = await findEntityChanges();
      expect(changes).toHaveLength(2);
      const updated = changes.find(change => change.type === 'UPDATE');
      expect(updated?.patch?.['payload']).toEqual(new Uint8Array([7, 6]));
      expect(updated?.inversePatch?.['payload']).toEqual(new Uint8Array([5, 6]));

      const history = adapter.rxdb.versionManager.history(record);
      await firstValueFrom(history.undoHistories$);
      await history.undo();
      adapter.rxdb.entityManager.cleanAllCache();
      adapter.cleanAllCache();
      const undone = await firstValueFrom(BigIntEntityContractParent.get(entityId));
      expect(undone.payload).toEqual(new Uint8Array([5, 6]));
    });

    it('preserves bigint and binary values when switching and merging a branch', async () => {
      const entityId = 9_007_199_254_741_103n;
      const branchId = `bigint-binary-merge-${factory.name}`;
      const record = new BigIntEntityContractParent();
      record.id = entityId;
      record.rank = 103;
      record.amount = 9_007_199_254_741_104n;
      record.payload = new Uint8Array([1, 2]);
      await record.save();

      await adapter.rxdb.versionManager.createBranch(branchId);
      await adapter.rxdb.versionManager.switchBranch(branchId);
      adapter.rxdb.entityManager.cleanAllCache();
      adapter.cleanAllCache();
      const featureRecord = await firstValueFrom(BigIntEntityContractParent.get(entityId));
      featureRecord.amount = 9_007_199_254_741_105n;
      featureRecord.payload = new Uint8Array([3, 4]);
      await featureRecord.save();

      const findEntityChanges = async () => {
        const changes = await adapter.localRxDBChange().find({
          where: {
            combinator: 'and',
            rules: [{ field: 'entity', operator: '=', value: 'BigIntEntityContractParent' }]
          },
          orderBy: [{ field: 'id', sort: 'asc' }]
        });
        return changes.filter(change => change.entityId === entityId);
      };
      const featureChange = (await findEntityChanges()).find(
        change => change.branchId === branchId && change.type === 'UPDATE'
      );
      expect(featureChange?.entityId).toBe(entityId);
      expect(typeof featureChange?.entityId).toBe('bigint');
      expect(featureChange?.patch?.['amount']).toBe(9_007_199_254_741_105n);
      expect(featureChange?.patch?.['payload']).toEqual(new Uint8Array([3, 4]));
      expect(featureChange?.inversePatch?.['amount']).toBe(9_007_199_254_741_104n);
      expect(featureChange?.inversePatch?.['payload']).toEqual(new Uint8Array([1, 2]));

      await adapter.rxdb.versionManager.switchBranch('main');
      adapter.rxdb.entityManager.cleanAllCache();
      adapter.cleanAllCache();
      const mainBeforeMerge = await firstValueFrom(BigIntEntityContractParent.get(entityId));
      expect(mainBeforeMerge.amount).toBe(9_007_199_254_741_104n);
      expect(mainBeforeMerge.payload).toEqual(new Uint8Array([1, 2]));

      const result = await adapter.rxdb.versionManager.mergeBranch(branchId);
      expect(result.merged).toBe(1);
      adapter.rxdb.entityManager.cleanAllCache();
      adapter.cleanAllCache();
      const merged = await firstValueFrom(BigIntEntityContractParent.get(entityId));
      expect(merged.id).toBe(entityId);
      expect(typeof merged.id).toBe('bigint');
      expect(merged.amount).toBe(9_007_199_254_741_105n);
      expect(typeof merged.amount).toBe('bigint');
      expect(merged.payload).toEqual(new Uint8Array([3, 4]));
      expect(merged.payload).toBeInstanceOf(Uint8Array);

      const mainChange = (await findEntityChanges()).find(
        change => change.branchId === 'main' && change.type === 'UPDATE'
      );
      expect(mainChange?.entityId).toBe(entityId);
      expect(mainChange?.patch?.['amount']).toBe(9_007_199_254_741_105n);
      expect(mainChange?.patch?.['payload']).toEqual(new Uint8Array([3, 4]));
      expect(mainChange?.inversePatch?.['amount']).toBe(9_007_199_254_741_104n);
      expect(mainChange?.inversePatch?.['payload']).toEqual(new Uint8Array([1, 2]));
    });
  });
}
