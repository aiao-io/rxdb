import { of } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDB } from '../../RxDB.js';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import type { EntityData, EntityType } from '../../entity/entity.interface.js';
import {
  type EntityRelationManyToManyMetadata,
  type EntityRelationOneToManyMetadata,
  PropertyType,
  RelationKind,
  SyncType
} from '../../entity/metadata-options.interface.js';
import { EntityRelationCache } from '../../entity/relation-cache.js';
import type { IRxDBAdapter } from '../../rxdb-adapter.js';
import { getEntityMetadata, getEntityStatus } from '../../rxdb-utils.js';

describe('EntityRelationCache', () => {
  @Entity({
    name: 'RelationCacheOwner',
    relations: [
      {
        name: 'tags',
        kind: RelationKind.MANY_TO_MANY,
        mappedEntity: 'RelationCacheTag',
        mappedProperty: 'owners'
      }
    ]
  })
  class RelationCacheOwner extends EntityBase {}

  @Entity({
    name: 'RelationCacheTag',
    relations: [
      {
        name: 'owners',
        kind: RelationKind.MANY_TO_MANY,
        mappedEntity: 'RelationCacheOwner',
        mappedProperty: 'tags'
      }
    ]
  })
  class RelationCacheTag extends EntityBase {}

  @Entity({ name: 'RelationCacheUnmapped' })
  class RelationCacheUnmapped extends EntityBase {}

  @Entity({
    name: 'RelationCacheManualJunction',
    properties: [
      { name: 'linksId', type: PropertyType.uuid },
      { name: 'missingOwnersId', type: PropertyType.uuid }
    ]
  })
  class RelationCacheManualJunction extends EntityBase {}

  const ORDINARY_RELATION = {
    name: 'tags',
    kind: RelationKind.ONE_TO_MANY,
    mappedNamespace: 'public',
    mappedEntity: 'RelationCacheTag',
    mappedProperty: 'owner'
  } satisfies EntityRelationOneToManyMetadata;

  const SECOND_ORDINARY_RELATION = {
    name: 'archivedTags',
    kind: RelationKind.ONE_TO_MANY,
    mappedNamespace: 'public',
    mappedEntity: 'RelationCacheTag',
    mappedProperty: 'archivedOwner'
  } satisfies EntityRelationOneToManyMetadata;

  const UNCACHED_RELATION = {
    name: 'uncachedTags',
    kind: RelationKind.ONE_TO_MANY,
    mappedNamespace: 'public',
    mappedEntity: 'RelationCacheTag',
    mappedProperty: 'uncachedOwner'
  } satisfies EntityRelationOneToManyMetadata;

  const UNMAPPED_MANY_TO_MANY_RELATION = {
    name: 'links',
    kind: RelationKind.MANY_TO_MANY,
    columnName: 'links',
    mappedNamespace: 'public',
    mappedEntity: 'RelationCacheUnmapped',
    mappedProperty: 'missingOwners',
    junctionEntityType: RelationCacheManualJunction
  } satisfies EntityRelationManyToManyMetadata;

  type EntityDataConstructor = new (data: EntityData) => InstanceType<EntityType>;

  let rxdb!: RxDB;

  const requireManyToManyRelation = (EntityClass: EntityType, name: string): EntityRelationManyToManyMetadata => {
    const relation = getEntityMetadata(EntityClass).relationMap.get(name);
    if (!relation || relation.kind !== RelationKind.MANY_TO_MANY) {
      throw new Error(`Missing MANY_TO_MANY relation: ${name}`);
    }
    return relation;
  };

  const createCache = (owner: RelationCacheOwner): EntityRelationCache => {
    const status = getEntityStatus(owner);
    return new EntityRelationCache(
      () => status.target,
      () => owner
    );
  };

  const createJunction = (
    relation: EntityRelationManyToManyMetadata,
    targetId: unknown,
    relatedId: unknown
  ): InstanceType<EntityType> => {
    const JunctionEntity = relation.junctionEntityType as unknown as EntityDataConstructor;
    return new JunctionEntity({
      [`${relation.name}Id`]: relatedId,
      [`${relation.mappedProperty}Id`]: targetId
    });
  };

  const isTargetJunction = (
    entity: InstanceType<EntityType>,
    relation: EntityRelationManyToManyMetadata,
    targetId: unknown,
    relatedId: unknown
  ): boolean =>
    entity instanceof relation.junctionEntityType &&
    (Reflect.get(entity, `${relation.name}Id`) as unknown) === relatedId &&
    (Reflect.get(entity, `${relation.mappedProperty}Id`) as unknown) === targetId;

  const findTargetJunction = (
    entities: ReadonlySet<InstanceType<EntityType>>,
    relation: EntityRelationManyToManyMetadata,
    targetId: unknown,
    relatedId: unknown
  ): InstanceType<EntityType> => {
    for (const entity of entities) {
      if (isTargetJunction(entity, relation, targetId, relatedId)) return entity;
    }
    throw new Error('Target junction not found');
  };

  beforeAll(() => {
    rxdb = new RxDB({
      dbName: 'relation-cache-test',
      entities: [RelationCacheOwner, RelationCacheTag, RelationCacheUnmapped, RelationCacheManualJunction],
      sync: {
        local: { adapter: 'sqlite' },
        type: SyncType.None
      }
    });
    rxdb.adapter(
      'sqlite',
      () =>
        ({
          disconnect: async () => undefined,
          getRepository: () => ({
            count: () => of(0),
            find: () => of([]),
            findAll: () => of([]),
            get: () => of(null)
          })
        }) as unknown as IRxDBAdapter
    );
    rxdb.init();
  });

  afterAll(async () => {
    await rxdb.disconnectAll();
  });

  it('maintains ordinary relation caches through add, remove, clean, clear and iteration', () => {
    const owner = new RelationCacheOwner();
    const firstTag = new RelationCacheTag();
    const secondTag = new RelationCacheTag();
    const cache = createCache(owner);

    const firstSet = cache.get(ORDINARY_RELATION);
    expect(cache.get(ORDINARY_RELATION)).toBe(firstSet);

    cache.add(ORDINARY_RELATION, firstTag);
    expect(firstSet.has(firstTag)).toBe(true);

    cache.remove(ORDINARY_RELATION, firstTag);
    expect(firstSet.has(firstTag)).toBe(false);

    cache.add(ORDINARY_RELATION, firstTag);
    cache.add(SECOND_ORDINARY_RELATION, secondTag);
    const secondSet = cache.get(SECOND_ORDINARY_RELATION);
    const visited: Set<InstanceType<EntityType>>[] = [];
    cache.forEachRelationSet(entities => {
      visited.push(entities);
    });
    expect(visited).toEqual([firstSet, secondSet]);

    cache.clean(ORDINARY_RELATION);
    expect(firstSet.size).toBe(0);
    expect(secondSet.has(secondTag)).toBe(true);

    cache.clean(UNCACHED_RELATION);
    const afterMissingClean: Set<InstanceType<EntityType>>[] = [];
    cache.forEachRelationSet(entities => {
      afterMissingClean.push(entities);
    });
    expect(afterMissingClean).toEqual([firstSet, secondSet]);

    cache.clear();
    const afterClear: Set<InstanceType<EntityType>>[] = [];
    cache.forEachRelationSet(entities => {
      afterClear.push(entities);
    });
    expect(afterClear).toEqual([]);

    const recreatedSet = cache.get(ORDINARY_RELATION);
    expect(recreatedSet).not.toBe(firstSet);
    expect(recreatedSet.size).toBe(0);
  });

  it('creates a junction, populates both caches and ignores a duplicate add', () => {
    const owner = new RelationCacheOwner();
    const tag = new RelationCacheTag();
    const ownerRelation = requireManyToManyRelation(RelationCacheOwner, 'tags');
    const mappedRelation = requireManyToManyRelation(RelationCacheTag, 'owners');
    const cache = createCache(owner);
    const ownerSet = cache.get(ownerRelation);
    const mappedSet = getEntityStatus(tag).getRelationCache(mappedRelation);

    expect(ownerRelation.junctionEntityType).toBe(mappedRelation.junctionEntityType);

    cache.add(ownerRelation, tag);
    const junction = findTargetJunction(ownerSet, ownerRelation, owner.id, tag.id);

    expect(ownerSet).toEqual(new Set([tag, junction]));
    expect(mappedSet).toEqual(new Set([owner, junction]));
    expect(Reflect.get(junction, `${ownerRelation.name}Id`) as unknown).toBe(tag.id);
    expect(Reflect.get(junction, `${ownerRelation.mappedProperty}Id`) as unknown).toBe(owner.id);

    cache.add(ownerRelation, tag);

    expect(ownerSet).toEqual(new Set([tag, junction]));
    expect(mappedSet).toEqual(new Set([owner, junction]));
    expect(findTargetJunction(ownerSet, ownerRelation, owner.id, tag.id)).toBe(junction);
  });

  it('reuses a junction already cached by the related entity', () => {
    const owner = new RelationCacheOwner();
    const tag = new RelationCacheTag();
    const ownerRelation = requireManyToManyRelation(RelationCacheOwner, 'tags');
    const mappedRelation = requireManyToManyRelation(RelationCacheTag, 'owners');
    const cache = createCache(owner);
    const mappedSet = getEntityStatus(tag).getRelationCache(mappedRelation);
    const existingJunction = createJunction(ownerRelation, owner.id, tag.id);

    mappedSet.add(existingJunction);
    cache.add(ownerRelation, tag);

    const ownerSet = cache.get(ownerRelation);
    expect(findTargetJunction(ownerSet, ownerRelation, owner.id, tag.id)).toBe(existingJunction);
    expect(ownerSet).toEqual(new Set([tag, existingJunction]));
    expect(mappedSet).toEqual(new Set([existingJunction, owner]));
    expect(cache.getRemovableJunctions().size).toBe(0);
  });

  it('removes a junction and restores the same instance from the removable set', () => {
    const owner = new RelationCacheOwner();
    const tag = new RelationCacheTag();
    const ownerRelation = requireManyToManyRelation(RelationCacheOwner, 'tags');
    const mappedRelation = requireManyToManyRelation(RelationCacheTag, 'owners');
    const cache = createCache(owner);
    const ownerSet = cache.get(ownerRelation);
    const mappedSet = getEntityStatus(tag).getRelationCache(mappedRelation);
    const removable = cache.getRemovableJunctions();

    cache.add(ownerRelation, tag);
    const junction = findTargetJunction(ownerSet, ownerRelation, owner.id, tag.id);

    cache.remove(ownerRelation, tag);

    expect(ownerSet.size).toBe(0);
    expect(mappedSet.size).toBe(0);
    expect(removable).toEqual(new Set([junction]));

    cache.add(ownerRelation, tag);

    expect(findTargetJunction(ownerSet, ownerRelation, owner.id, tag.id)).toBe(junction);
    expect(ownerSet).toEqual(new Set([tag, junction]));
    expect(mappedSet).toEqual(new Set([owner, junction]));
    expect(removable.size).toBe(0);
  });

  it('rebuilds a removed junction instead of restoring it', () => {
    const owner = new RelationCacheOwner();
    const tag = new RelationCacheTag();
    const ownerRelation = requireManyToManyRelation(RelationCacheOwner, 'tags');
    const mappedRelation = requireManyToManyRelation(RelationCacheTag, 'owners');
    const cache = createCache(owner);
    const ownerSet = cache.get(ownerRelation);
    const mappedSet = getEntityStatus(tag).getRelationCache(mappedRelation);

    cache.add(ownerRelation, tag);
    const removedJunction = findTargetJunction(ownerSet, ownerRelation, owner.id, tag.id);
    cache.remove(ownerRelation, tag);
    getEntityStatus(removedJunction).removed = true;

    cache.add(ownerRelation, tag);
    const rebuiltJunction = findTargetJunction(ownerSet, ownerRelation, owner.id, tag.id);

    expect(rebuiltJunction).not.toBe(removedJunction);
    expect(getEntityStatus(rebuiltJunction).removed).toBe(false);
    expect(ownerSet).toEqual(new Set([tag, rebuiltJunction]));
    expect(mappedSet).toEqual(new Set([owner, rebuiltJunction]));
    expect(cache.getRemovableJunctions().size).toBe(0);
  });

  it('removes the related entity without marking mismatched junctions as removable', () => {
    const owner = new RelationCacheOwner();
    const otherOwner = new RelationCacheOwner();
    const tag = new RelationCacheTag();
    const otherTag = new RelationCacheTag();
    const ownerRelation = requireManyToManyRelation(RelationCacheOwner, 'tags');
    const cache = createCache(owner);
    const ownerSet = cache.get(ownerRelation);
    const differentRelatedJunction = createJunction(ownerRelation, owner.id, otherTag.id);
    const differentTargetJunction = createJunction(ownerRelation, otherOwner.id, tag.id);

    ownerSet.add(tag);
    ownerSet.add(differentRelatedJunction);
    ownerSet.add(differentTargetJunction);

    cache.remove(ownerRelation, tag);

    expect(ownerSet).toEqual(new Set([differentRelatedJunction, differentTargetJunction]));
    expect(cache.getRemovableJunctions().size).toBe(0);
  });

  it('handles a missing mapped relation while adding and removing a junction', () => {
    const owner = new RelationCacheOwner();
    const related = new RelationCacheUnmapped();
    const cache = createCache(owner);
    const ownerSet = cache.get(UNMAPPED_MANY_TO_MANY_RELATION);

    cache.add(UNMAPPED_MANY_TO_MANY_RELATION, related);
    const junction = findTargetJunction(ownerSet, UNMAPPED_MANY_TO_MANY_RELATION, owner.id, related.id);

    expect(junction).toBeInstanceOf(RelationCacheManualJunction);
    expect(ownerSet).toEqual(new Set([related, junction]));

    cache.remove(UNMAPPED_MANY_TO_MANY_RELATION, related);

    const removable = cache.getRemovableJunctions();
    expect(ownerSet.size).toBe(0);
    expect(removable).toEqual(new Set([junction]));

    cache.clear();

    expect(removable.size).toBe(0);
    expect(cache.getRemovableJunctions().size).toBe(0);
  });
});
