/**
 * @fileoverview 外键成环时的推送切批（US-038）：互相引用的行不拆进两批，断环边上指向同批行的外键先写空
 *
 * @remarks
 * 只看切批本身。关系外键成的环（shop 的 `User.idCard` ↔ `IdCard.owner`）由 `push-repository.spec` 的 AC#4
 * 与 PGlite 的 `fk-cycle-push.spec.ts` 覆盖；这里补的是只由复合外键成的环。
 */
import {
  Entity,
  EntityBase,
  getEntityMetadata,
  PropertyType,
  type RepositoryIdentifier,
  repositoryKey
} from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { buildDependencyGraph } from '../dependency-graph.js';
import { type CycleBatchEntry, planCycleBatches } from '../push-cycle.js';

/** 没有关系：`(bId, tenantId)` → B`(id, tenantId)`（`bId` 可空），`(aId, tenantId)` → A`(id, tenantId)`（非空） */
@Entity({
  name: 'PushCompositeA',
  namespace: 'pushcomposite',
  properties: [
    { name: 'tenantId', type: PropertyType.string },
    { name: 'bId', type: PropertyType.uuid, nullable: true }
  ],
  indexes: [{ name: 'push_composite_a_identity', properties: ['id', 'tenantId'], unique: true }],
  foreignKeys: [
    {
      name: 'push_composite_a_b',
      properties: ['bId', 'tenantId'],
      mappedEntity: 'PushCompositeB',
      mappedProperties: ['id', 'tenantId']
    }
  ]
})
class PushCompositeA extends EntityBase {}

@Entity({
  name: 'PushCompositeB',
  namespace: 'pushcomposite',
  properties: [
    { name: 'tenantId', type: PropertyType.string },
    { name: 'aId', type: PropertyType.uuid }
  ],
  indexes: [{ name: 'push_composite_b_identity', properties: ['id', 'tenantId'], unique: true }],
  foreignKeys: [
    {
      name: 'push_composite_b_a',
      properties: ['aId', 'tenantId'],
      mappedEntity: 'PushCompositeA',
      mappedProperties: ['id', 'tenantId']
    }
  ]
})
class PushCompositeB extends EntityBase {}

const A: RepositoryIdentifier = { namespace: 'pushcomposite', entity: 'PushCompositeA' };
const B: RepositoryIdentifier = { namespace: 'pushcomposite', entity: 'PushCompositeB' };

const entry = (repository: RepositoryIdentifier, values: Record<string, unknown>): CycleBatchEntry => ({
  repository,
  entityId: String(values['id']),
  branchId: 'main',
  values
});

describe('planCycleBatches（US-038）', () => {
  it('只由复合外键成的环：互相引用的行并进同一批，断环边上指向同批行的外键先写空', () => {
    const graph = buildDependencyGraph([PushCompositeA, PushCompositeB].map(entity => getEntityMetadata(entity)));
    const cycle = graph.get(repositoryKey(A))?.cycle;
    if (!cycle?.breakEdges) throw new Error('A、B 应成一个断得开的环');
    // 与 push-repository.ts 的 pushCyclePlans 同一取法：两端都在环上的外键
    const memberKeys = new Set(cycle.members.map(repositoryKey));
    const cycleEdges = cycle.members.flatMap(member =>
      (graph.get(repositoryKey(member))?.foreignKeys ?? []).filter(edge => memberKeys.has(repositoryKey(edge.to)))
    );

    const batches = planCycleBatches(
      [
        entry(A, { id: 'a1', tenantId: 't', bId: 'b1' }),
        entry(A, { id: 'a2', tenantId: 't', bId: null }),
        entry(B, { id: 'b1', tenantId: 't', aId: 'a1' }),
        entry(B, { id: 'b2', tenantId: 't', aId: 'a2' })
      ],
      cycleEdges,
      cycle.breakEdges,
      2
    );

    expect(batches.map(batch => batch.entries.map(item => item.entityId))).toEqual([
      ['a1', 'b1'],
      ['a2', 'b2']
    ]);
    expect(batches.map(batch => batch.deferredForeignKeys)).toEqual([
      [{ namespace: 'pushcomposite', entity: 'PushCompositeA', property: 'bId' }],
      []
    ]);
  });
});
