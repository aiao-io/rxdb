import { firstValueFrom, Observable, of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RxDB } from '../../RxDB.js';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import type {
  EntityType,
  RelationEntitiesObservable,
  RelationEntityObservable,
  UUID
} from '../../entity/entity.interface.js';
import { fillDefaultValue, getNeedRemoveEntities } from '../../entity/entity.utils.js';
import { PropertyType, RelationKind, SyncType } from '../../entity/metadata-options.interface.js';
import { transitionMetadata } from '../../entity/metadata-transition.js';
import type { IRxDBAdapter, RxDBMutationsMap } from '../../rxdb-adapter.js';
import { getEntityMetadata, getEntityStatus, uuid } from '../../rxdb-utils.js';

@Entity({
  name: 'ReviewEntityParent',
  relations: [
    { name: 'children', kind: RelationKind.ONE_TO_MANY, mappedEntity: 'ReviewEntityChild', mappedProperty: 'parent' }
  ]
})
class ReviewParent extends EntityBase {}

@Entity({
  name: 'ReviewEntityChild',
  properties: [{ name: 'label', type: PropertyType.string }],
  relations: [
    {
      name: 'parent',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'ReviewEntityParent',
      mappedProperty: 'children',
      nullable: true
    }
  ]
})
class ReviewChild extends EntityBase {
  label!: string;
  parentId!: UUID | null;
  declare parent$: RelationEntityObservable<typeof ReviewParent>;
}

@Entity({
  name: 'ReviewEntityOwner',
  relations: [
    { name: 'tags', kind: RelationKind.MANY_TO_MANY, mappedEntity: 'ReviewEntityTag', mappedProperty: 'owners' }
  ]
})
class ReviewOwner extends EntityBase {
  declare tags$: RelationEntitiesObservable<typeof ReviewTag>;
}

@Entity({
  name: 'ReviewEntityTag',
  relations: [
    { name: 'owners', kind: RelationKind.MANY_TO_MANY, mappedEntity: 'ReviewEntityOwner', mappedProperty: 'tags' }
  ]
})
class ReviewTag extends EntityBase {}

const openDatabases: RxDB[] = [];
function setup() {
  const db = new RxDB({
    dbName: `review-entity-${uuid()}`,
    entities: [ReviewParent, ReviewChild, ReviewOwner, ReviewTag],
    sync: { type: SyncType.None, local: { adapter: 'review' } }
  });
  db.adapter('review', () => ({ disconnect: async () => undefined }) as unknown as IRxDBAdapter);
  db.init();
  openDatabases.push(db);
  return db;
}
function manyToMany(db: RxDB) {
  const owner = db.entityManager.createEntityRef(ReviewOwner, { id: uuid() }, { local: true });
  const tag = db.entityManager.createEntityRef(ReviewTag, { id: uuid() }, { local: true });
  const relation = getEntityMetadata(ReviewOwner).relationMap.get('tags');
  if (!relation || relation.kind !== RelationKind.MANY_TO_MANY) throw new Error('No relation');
  const junctionType = db.schemaManager.getEntityType<EntityType>(
    getEntityMetadata(relation.junctionEntityType).name,
    getEntityMetadata(relation.junctionEntityType).namespace
  );
  if (!junctionType) throw new Error('No junction');
  return { owner, tag, relation, junctionType };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(openDatabases.splice(0).map(db => db.disconnectAll()));
});

describe('review entity audit', () => {
  it('external FK hydration must update the already-held relation subscription', () => {
    const db = setup();
    const parentA = db.entityManager.createEntityRef(ReviewParent, { id: uuid() }, { local: true });
    const parentB = db.entityManager.createEntityRef(ReviewParent, { id: uuid() }, { local: true });
    const repository = db.entityManager.getRepository(ReviewParent);
    vi.spyOn(repository, 'get').mockImplementation(id => of(id === parentA.id ? parentA : parentB));
    const child = db.entityManager.createEntityRef(ReviewChild, { id: uuid(), parentId: parentA.id }, { local: true });
    const values: (UUID | null)[] = [];
    const subscription = child.parent$.subscribe((parent: ReviewParent | null) => values.push(parent?.id ?? null));
    db.entityManager.createEntityRef(ReviewChild, { id: child.id, parentId: parentB.id }, { local: true });
    subscription.unsubscribe();
    expect(child.parentId).toBe(parentB.id);
    expect(values).toEqual([parentA.id, parentB.id]);
  });

  it('hydrated many-to-many relations must be removable after their first query', async () => {
    const db = setup();
    const { owner, tag, junctionType } = manyToMany(db);
    const junction = db.entityManager.createEntityRef(
      junctionType,
      { id: uuid(), ownersId: owner.id, tagsId: tag.id },
      { local: true }
    );
    vi.spyOn(db.entityManager.getRepository(junctionType), 'findAll').mockReturnValue(of([junction]));
    vi.spyOn(db.entityManager.getRepository(ReviewTag), 'findAll').mockReturnValue(of([tag]));
    expect(await firstValueFrom(owner.tags$)).toEqual([tag]);
    owner.tags$.remove(tag);
    expect(getNeedRemoveEntities([owner])).toContain(junction);
  });

  it('saveMany must forward pending junction deletion just like save', async () => {
    const db = setup();
    const { owner, tag, relation, junctionType } = manyToMany(db);
    owner.tags$.add(tag);
    const junction = [...getEntityStatus(owner).getRelationCache(relation)].find(
      entity => entity instanceof junctionType
    );
    if (!junction) throw new Error('No pending junction');
    getEntityStatus(junction).local = true;
    getEntityStatus(junction).modified = false;
    owner.tags$.remove(tag);
    expect(getNeedRemoveEntities([owner])).toEqual([junction]);
    const mutations = vi.spyOn(db.entityManager, 'mutations').mockResolvedValue([]);
    await db.entityManager.saveMany([owner]);
    const submitted = mutations.mock.calls[0][0] as RxDBMutationsMap;
    expect([...submitted.remove.values()].flatMap(entities => [...entities])).toContain(junction);
  });

  it('reset followed by an edit in the same tick must publish the later edit', async () => {
    const db = setup();
    const child = db.entityManager.createEntityRef(ReviewChild, { id: uuid(), label: 'before' }, { local: true });
    const state = getEntityStatus(child);
    const values: unknown[] = [];
    const subscription = state.patches$.subscribe(patches => values.push(patches.map(record => record.patch)));
    child.label = 'discard';
    child.reset();
    child.label = 'keep';
    await Promise.resolve();
    subscription.unsubscribe();
    expect(state.patch).toEqual({ label: 'keep' });
    expect(values).toEqual([[], [{ label: 'keep' }]]);
  });

  it('hydration must preserve a pending many-to-many addition until save', () => {
    const db = setup();
    const { owner, tag, relation, junctionType } = manyToMany(db);
    owner.tags$.add(tag);
    const junction = [...getEntityStatus(owner).getRelationCache(relation)].find(
      entity => entity instanceof junctionType
    );
    expect(junction).toBeDefined();
    db.entityManager.createEntityRef(ReviewOwner, { id: owner.id }, { local: true });
    expect(getEntityStatus(owner).getNeedSaveEntities()).toContain(junction);
  });

  it('last relation unsubscribe must release the repository subscription', async () => {
    const db = setup();
    const parent = db.entityManager.createEntityRef(ReviewParent, { id: uuid() }, { local: true });
    const repository = db.entityManager.getRepository(ReviewParent);
    const released = vi.fn();
    vi.spyOn(repository, 'get').mockReturnValue(
      new Observable(subscriber => {
        subscriber.next(parent);
        return released;
      })
    );
    const child = db.entityManager.createEntityRef(ReviewChild, { id: uuid(), parentId: parent.id }, { local: true });
    expect(await firstValueFrom(child.parent$)).toBe(parent);
    expect(released).toHaveBeenCalledOnce();
  });

  it('mutable static defaults must be isolated between entity instances', () => {
    const defaults = ['initial'];
    const metadata = transitionMetadata({
      name: 'ReviewMutableDefault',
      properties: [{ name: 'labels', type: PropertyType.stringArray, default: defaults }]
    });
    const first = { labels: undefined as string[] | undefined };
    const second = { labels: undefined as string[] | undefined };
    fillDefaultValue(metadata, first);
    fillDefaultValue(metadata, second);
    first.labels!.push('first-only');
    expect(second.labels).toEqual(['initial']);
    expect(defaults).toEqual(['initial']);
  });
});
