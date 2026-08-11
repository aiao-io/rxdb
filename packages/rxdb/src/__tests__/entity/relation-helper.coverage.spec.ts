import { firstValueFrom, Observable, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { RxDBError } from '../../RxDBError.js';
import type { EntityManager } from '../../entity/entity-manager.js';
import type {
  EntityType,
  RelationEntitiesObservable,
  RelationEntityObservable,
  UUID
} from '../../entity/entity.interface.js';
import {
  type EntityRelationManyToManyMetadata,
  type EntityRelationManyToOneMetadata,
  type EntityRelationMetadata,
  type EntityRelationOneToManyMetadata,
  type EntityRelationOneToOneMetadata,
  RelationKind
} from '../../entity/metadata-options.interface.js';
import type { RelationObservableEntry } from '../../entity/relation-cache.js';
import relationHelper from '../../entity/relation-helper.js';
import { METADATA, STATUS } from '../../rxdb.private.js';

const SOURCE_ID = '10000000-0000-0000-0000-000000000001' as UUID;
const FIRST_TARGET_ID = '10000000-0000-0000-0000-000000000002' as UUID;
const SECOND_TARGET_ID = '10000000-0000-0000-0000-000000000003' as UUID;
const FIRST_CHILD_ID = '10000000-0000-0000-0000-000000000004' as UUID;
const SECOND_CHILD_ID = '10000000-0000-0000-0000-000000000005' as UUID;

class Source {
  id = SOURCE_ID;
  targetId: UUID | null = null;
  declare target$: RelationEntityObservable<typeof Target>;
  declare children$: RelationEntitiesObservable<typeof Child>;
  declare tags$: RelationEntitiesObservable<typeof Target>;
}

class Target {
  id = FIRST_TARGET_ID;
}

class Child {
  id = FIRST_CHILD_ID;
  declare source$: RelationEntityObservable<typeof Source>;
}

class SourceTag {
  id = FIRST_CHILD_ID;
  sourcesId = SOURCE_ID;
  tagsId = FIRST_TARGET_ID;
}

Object.defineProperty(SourceTag, METADATA, {
  value: { name: 'SourceTag', namespace: 'public' }
});

type StatusHarness = {
  addRelationEntity: ReturnType<typeof vi.fn<(relation: EntityRelationMetadata, entity: object) => void>>;
  cleanRelationEntity: ReturnType<typeof vi.fn<(relation: EntityRelationMetadata) => void>>;
  removeRelationEntity: ReturnType<typeof vi.fn<(relation: EntityRelationMetadata, entity: object) => void>>;
  getRelationObservableEntry: ReturnType<
    typeof vi.fn<(relation: EntityRelationMetadata) => RelationObservableEntry | undefined>
  >;
  setRelationObservableEntry: ReturnType<
    typeof vi.fn<(relation: EntityRelationMetadata, entry: RelationObservableEntry) => void>
  >;
};

type RepositoryHarness<T extends object> = {
  count: ReturnType<typeof vi.fn<(options: unknown) => Observable<number>>>;
  findAll: ReturnType<typeof vi.fn<(options: unknown) => Observable<T[]>>>;
  get: ReturnType<typeof vi.fn<(id: UUID) => Observable<T | null>>>;
};

type EntityManagerHarness = {
  em: EntityManager;
  getEntityType: ReturnType<typeof vi.fn<(name: string, namespace?: string) => EntityType | undefined>>;
  getRepository: ReturnType<typeof vi.fn<(entityType: EntityType) => object>>;
};

type SingleRelationCase = {
  label: string;
  relation: EntityRelationManyToOneMetadata | EntityRelationOneToOneMetadata;
};

const MANY_TO_ONE_RELATION = {
  name: 'target',
  kind: RelationKind.MANY_TO_ONE,
  mappedEntity: 'Target',
  mappedProperty: 'sources',
  mappedNamespace: 'public',
  columnName: 'target_id',
  nullable: true
} satisfies EntityRelationManyToOneMetadata;

const ONE_TO_ONE_RELATION = {
  name: 'target',
  kind: RelationKind.ONE_TO_ONE,
  mappedEntity: 'Target',
  mappedProperty: 'source',
  mappedNamespace: 'public',
  columnName: 'target_id',
  nullable: true
} satisfies EntityRelationOneToOneMetadata;

const ONE_TO_MANY_RELATION = {
  name: 'children',
  kind: RelationKind.ONE_TO_MANY,
  mappedEntity: 'Child',
  mappedProperty: 'source',
  mappedNamespace: 'public'
} satisfies EntityRelationOneToManyMetadata;

const MANY_TO_MANY_RELATION = {
  name: 'tags',
  kind: RelationKind.MANY_TO_MANY,
  mappedEntity: 'Target',
  mappedProperty: 'sources',
  mappedNamespace: 'public',
  columnName: 'tags',
  junctionEntityType: SourceTag
} satisfies EntityRelationManyToManyMetadata;

const SINGLE_RELATION_CASES: readonly SingleRelationCase[] = [
  { label: 'MANY_TO_ONE', relation: MANY_TO_ONE_RELATION },
  { label: 'ONE_TO_ONE', relation: ONE_TO_ONE_RELATION }
];

const createStatus = (): StatusHarness => {
  const observableEntries = new Map<EntityRelationMetadata, RelationObservableEntry>();
  return {
    addRelationEntity: vi.fn<(relation: EntityRelationMetadata, entity: object) => void>(),
    cleanRelationEntity: vi.fn<(relation: EntityRelationMetadata) => void>(),
    removeRelationEntity: vi.fn<(relation: EntityRelationMetadata, entity: object) => void>(),
    getRelationObservableEntry: vi.fn<(relation: EntityRelationMetadata) => RelationObservableEntry | undefined>(
      relation => observableEntries.get(relation)
    ),
    setRelationObservableEntry: vi.fn<(relation: EntityRelationMetadata, entry: RelationObservableEntry) => void>(
      (relation, entry) => {
        observableEntries.set(relation, entry);
      }
    )
  };
};

const attachStatus = <T extends object>(entity: T, status: StatusHarness): T => {
  Object.defineProperty(entity, STATUS, { value: status });
  return entity;
};

const createRepository = <T extends object>(): RepositoryHarness<T> => ({
  count: vi.fn<(options: unknown) => Observable<number>>(() => of(0)),
  findAll: vi.fn<(options: unknown) => Observable<T[]>>(() => of([])),
  get: vi.fn<(id: UUID) => Observable<T | null>>(() => of(null))
});

const createEntityManager = (
  mappedEntityType: EntityType | undefined,
  mappedRepository: object,
  junction?: { entityType: EntityType; repository: object }
): EntityManagerHarness => {
  const repositories = new Map<EntityType, object>();
  if (mappedEntityType) repositories.set(mappedEntityType, mappedRepository);
  if (junction) repositories.set(junction.entityType, junction.repository);

  const getEntityType = vi.fn<(name: string, namespace?: string) => EntityType | undefined>(name =>
    name === 'SourceTag' ? SourceTag : mappedEntityType
  );
  const getRepository = vi.fn<(entityType: EntityType) => object>(entityType => {
    const repository = repositories.get(entityType);
    if (!repository) throw new Error('unexpected repository lookup');
    return repository;
  });
  const em = {
    rxdb: { schemaManager: { getEntityType } },
    getRepository
  } as unknown as EntityManager;

  return { em, getEntityType, getRepository };
};

const createReverseRelation = () => {
  const set = vi.fn<(entity: Source | null) => void>();
  const remove = vi.fn<() => void>();
  const observable: RelationEntityObservable<typeof Source> = Object.assign(of<Source | null>(null), {
    set,
    remove
  });
  return { observable, remove, set };
};

const expectFrozenActions = (observable: object, actions: readonly string[]): void => {
  expect(Object.isFrozen(observable)).toBe(true);
  for (const action of actions) {
    expect(Object.getOwnPropertyDescriptor(observable, action)).toMatchObject({
      configurable: false,
      enumerable: false,
      writable: false
    });
  }
};

describe('relation-helper coverage', () => {
  it('rejects installation when the mapped entity cannot be resolved', () => {
    const repository = createRepository<Target>();
    const { em, getEntityType, getRepository } = createEntityManager(undefined, repository);
    const install = () => relationHelper(MANY_TO_ONE_RELATION, Source, em);

    expect(install).toThrow(RxDBError);
    expect(install).toThrow('mapped entity not found: Target');
    expect(getEntityType).toHaveBeenCalledTimes(2);
    expect(getEntityType).toHaveBeenLastCalledWith('Target', 'public');
    expect(getRepository).not.toHaveBeenCalled();
  });

  it('rejects installation when the relation kind is unrecognized', () => {
    const repository = createRepository<Target>();
    const { em } = createEntityManager(Target, repository);
    const invalidRelation = {
      ...MANY_TO_ONE_RELATION,
      kind: 'unknown' as RelationKind
    } as unknown as EntityRelationMetadata;
    const install = () => relationHelper(invalidRelation, Source, em);

    expect(install).toThrow(RxDBError);
    expect(install).toThrow('unsupported relation kind: unknown');
  });

  describe.each(SINGLE_RELATION_CASES)('$label', ({ relation }) => {
    it('streams null and entity changes while ignoring duplicate and repeated removals', () => {
      const firstTarget = new Target();
      const secondTarget = Object.assign(new Target(), { id: SECOND_TARGET_ID });
      const repository = createRepository<Target>();
      repository.get.mockImplementation(id => of(id === FIRST_TARGET_ID ? firstTarget : secondTarget));
      const { em } = createEntityManager(Target, repository);
      const status = createStatus();
      const source = attachStatus(new Source(), status);

      relationHelper(relation, Source, em);
      const relation$ = source.target$;
      const emissions = vi.fn<(entity: Target | null) => void>();
      const subscription = relation$.subscribe(emissions);

      relation$.remove();
      relation$.set(null);
      relation$.set(firstTarget);

      const replayed = vi.fn<(entity: Target | null) => void>();
      const replaySubscription = relation$.subscribe(replayed);
      replaySubscription.unsubscribe();

      relation$.set(firstTarget);
      relation$.set(secondTarget);
      relation$.set(null);
      relation$.remove();
      subscription.unsubscribe();

      expect(emissions.mock.calls).toEqual([[null], [firstTarget], [secondTarget], [null]]);
      expect(replayed).toHaveBeenCalledOnce();
      expect(replayed).toHaveBeenCalledWith(firstTarget);
      expect(repository.get.mock.calls).toEqual([[FIRST_TARGET_ID], [SECOND_TARGET_ID]]);
      expect(status.addRelationEntity).toHaveBeenNthCalledWith(1, relation, firstTarget);
      expect(status.addRelationEntity).toHaveBeenNthCalledWith(2, relation, secondTarget);
      expect(status.cleanRelationEntity).toHaveBeenCalledOnce();
      expect(status.cleanRelationEntity).toHaveBeenCalledWith(relation);
      expect(status.removeRelationEntity).not.toHaveBeenCalled();
      expect(source.targetId).toBeNull();
      expectFrozenActions(relation$, ['set', 'remove']);
    });

    it('memoizes the relation observable across repeated getter access (RXD-012)', () => {
      const repository = createRepository<Target>();
      const { em } = createEntityManager(Target, repository);
      const status = createStatus();
      const source = attachStatus(new Source(), status);

      relationHelper(relation, Source, em);

      const first = source.target$;
      const second = source.target$;

      expect(second).toBe(first);
      expect(status.setRelationObservableEntry).toHaveBeenCalledOnce();
      expect(status.getRelationObservableEntry).toHaveBeenCalledTimes(2);
    });
  });

  it('loads and mutates one-to-many relations through the reverse relation', async () => {
    const firstChild = new Child();
    const secondChild = Object.assign(new Child(), { id: SECOND_CHILD_ID });
    const firstReverse = createReverseRelation();
    const secondReverse = createReverseRelation();
    firstChild.source$ = firstReverse.observable;
    secondChild.source$ = secondReverse.observable;

    const repository = createRepository<Child>();
    repository.findAll.mockReturnValue(of([firstChild, secondChild]));
    repository.count.mockReturnValue(of(2));
    const { em } = createEntityManager(Child, repository);
    const status = createStatus();
    const source = attachStatus(new Source(), status);

    relationHelper(ONE_TO_MANY_RELATION, Source, em);
    const relation$ = source.children$;

    expect(repository.findAll).not.toHaveBeenCalled();
    expect(repository.count).not.toHaveBeenCalled();
    await expect(firstValueFrom(relation$)).resolves.toEqual([firstChild, secondChild]);
    await expect(firstValueFrom(relation$.count$)).resolves.toBe(2);

    const expectedQuery = {
      where: {
        combinator: 'and',
        rules: [{ field: 'sourceId', operator: '=', value: SOURCE_ID }]
      }
    };
    expect(repository.findAll).toHaveBeenCalledWith(expectedQuery);
    expect(repository.count).toHaveBeenCalledWith(expectedQuery);

    relation$.add(firstChild, secondChild);
    relation$.add();
    relation$.remove(firstChild, secondChild);
    relation$.remove();

    expect(status.addRelationEntity).toHaveBeenNthCalledWith(1, ONE_TO_MANY_RELATION, firstChild);
    expect(status.addRelationEntity).toHaveBeenNthCalledWith(2, ONE_TO_MANY_RELATION, secondChild);
    expect(status.removeRelationEntity).toHaveBeenNthCalledWith(1, ONE_TO_MANY_RELATION, firstChild);
    expect(status.removeRelationEntity).toHaveBeenNthCalledWith(2, ONE_TO_MANY_RELATION, secondChild);
    expect(firstReverse.set).toHaveBeenCalledWith(source);
    expect(secondReverse.set).toHaveBeenCalledWith(source);
    expect(firstReverse.remove).toHaveBeenCalledOnce();
    expect(secondReverse.remove).toHaveBeenCalledOnce();
    expectFrozenActions(relation$, ['count$', 'add', 'remove']);

    const descriptor = Object.getOwnPropertyDescriptor(Source.prototype, 'children$');
    expect(descriptor).toMatchObject({ configurable: true, enumerable: false });
    expect(descriptor?.get).toBeTypeOf('function');
    expect(descriptor?.set).toBeTypeOf('function');
    expect(Reflect.set(source, 'children$', relation$)).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(source, 'children$')).toBe(false);
    expect(Object.keys(source)).not.toContain('children$');
  });

  it('memoizes the one-to-many relation observable across repeated getter access (RXD-012)', () => {
    const repository = createRepository<Child>();
    const { em } = createEntityManager(Child, repository);
    const status = createStatus();
    const source = attachStatus(new Source(), status);

    relationHelper(ONE_TO_MANY_RELATION, Source, em);

    const first = source.children$;
    const second = source.children$;

    expect(second).toBe(first);
    expect(status.setRelationObservableEntry).toHaveBeenCalledOnce();
  });

  it('loads, counts and mutates many-to-many relations through the junction repository', async () => {
    const firstTarget = new Target();
    const secondTarget = Object.assign(new Target(), { id: SECOND_TARGET_ID });
    const firstJunction = new SourceTag();
    const secondJunction = Object.assign(new SourceTag(), {
      id: SECOND_CHILD_ID,
      tagsId: SECOND_TARGET_ID
    });

    const targetRepository = createRepository<Target>();
    targetRepository.findAll.mockReturnValue(of([firstTarget, secondTarget]));
    const junctionRepository = createRepository<SourceTag>();
    junctionRepository.findAll.mockReturnValue(of([firstJunction, secondJunction]));
    junctionRepository.count.mockReturnValue(of(2));
    const { em, getRepository } = createEntityManager(Target, targetRepository, {
      entityType: SourceTag,
      repository: junctionRepository
    });
    const status = createStatus();
    const source = attachStatus(new Source(), status);

    relationHelper(MANY_TO_MANY_RELATION, Source, em);
    const relation$ = source.tags$;

    expect(junctionRepository.findAll).not.toHaveBeenCalled();
    expect(junctionRepository.count).not.toHaveBeenCalled();
    await expect(firstValueFrom(relation$)).resolves.toEqual([firstTarget, secondTarget]);
    await expect(firstValueFrom(relation$.count$)).resolves.toBe(2);

    expect(junctionRepository.findAll).toHaveBeenCalledWith({
      where: {
        combinator: 'and',
        rules: [{ field: 'sourcesId', operator: '=', value: SOURCE_ID }]
      }
    });
    expect(targetRepository.findAll).toHaveBeenCalledWith({
      where: {
        combinator: 'and',
        rules: [{ field: 'id', operator: 'in', value: [FIRST_TARGET_ID, SECOND_TARGET_ID] }]
      }
    });
    expect(junctionRepository.count).toHaveBeenCalledWith({
      where: {
        combinator: 'and',
        rules: [{ field: 'sourcesId', operator: '=', value: SOURCE_ID }]
      }
    });
    expect(getRepository).toHaveBeenCalledWith(SourceTag);
    expect(getRepository).toHaveBeenCalledWith(Target);

    relation$.add(firstTarget, secondTarget);
    relation$.add();
    relation$.remove(firstTarget, secondTarget);
    relation$.remove();

    expect(status.addRelationEntity).toHaveBeenNthCalledWith(1, MANY_TO_MANY_RELATION, firstTarget);
    expect(status.addRelationEntity).toHaveBeenNthCalledWith(2, MANY_TO_MANY_RELATION, secondTarget);
    expect(status.removeRelationEntity).toHaveBeenNthCalledWith(1, MANY_TO_MANY_RELATION, firstTarget);
    expect(status.removeRelationEntity).toHaveBeenNthCalledWith(2, MANY_TO_MANY_RELATION, secondTarget);
    expect(status.cleanRelationEntity).not.toHaveBeenCalled();
    expectFrozenActions(relation$, ['count$', 'add', 'remove']);
  });

  it('memoizes the many-to-many relation observable across repeated getter access (RXD-012)', () => {
    const targetRepository = createRepository<Target>();
    const junctionRepository = createRepository<SourceTag>();
    const { em } = createEntityManager(Target, targetRepository, {
      entityType: SourceTag,
      repository: junctionRepository
    });
    const status = createStatus();
    const source = attachStatus(new Source(), status);

    relationHelper(MANY_TO_MANY_RELATION, Source, em);

    const first = source.tags$;
    const second = source.tags$;

    expect(second).toBe(first);
    expect(status.setRelationObservableEntry).toHaveBeenCalledOnce();
  });

  it('passes an empty junction result to the mapped repository as an empty id query', async () => {
    const targetRepository = createRepository<Target>();
    targetRepository.findAll.mockReturnValue(of([]));
    const junctionRepository = createRepository<SourceTag>();
    junctionRepository.findAll.mockReturnValue(of([]));
    const { em } = createEntityManager(Target, targetRepository, {
      entityType: SourceTag,
      repository: junctionRepository
    });
    const source = attachStatus(new Source(), createStatus());

    relationHelper(MANY_TO_MANY_RELATION, Source, em);

    await expect(firstValueFrom(source.tags$)).resolves.toEqual([]);
    expect(targetRepository.findAll).toHaveBeenCalledWith({
      where: {
        combinator: 'and',
        rules: [{ field: 'id', operator: 'in', value: [] }]
      }
    });
  });

  it('rejects access to a many-to-many relation without a junction entity', () => {
    const repository = createRepository<Target>();
    const { em } = createEntityManager(Target, repository);
    const source = attachStatus(new Source(), createStatus());
    const invalidRelation = {
      ...MANY_TO_MANY_RELATION,
      junctionEntityType: undefined
    } as unknown as EntityRelationMetadata;

    relationHelper(invalidRelation, Source, em);

    expect(() => source.tags$).toThrow(RxDBError);
    expect(() => source.tags$).toThrow('junction entity not found');
  });
});
