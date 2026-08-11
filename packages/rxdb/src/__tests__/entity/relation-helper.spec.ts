import { firstValueFrom, Observable, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

const OWNER_ID = '00000000-0000-0000-0000-000000000001' as UUID;
const TARGET_ID = '00000000-0000-0000-0000-000000000002' as UUID;
const SECOND_TARGET_ID = '00000000-0000-0000-0000-000000000003' as UUID;
const CHILD_ID = '00000000-0000-0000-0000-000000000004' as UUID;
const SECOND_CHILD_ID = '00000000-0000-0000-0000-000000000005' as UUID;

class Owner {
  id = OWNER_ID;
  targetId: UUID | null = null;
  declare target$: RelationEntityObservable<typeof Target>;
  declare children$: RelationEntitiesObservable<typeof Child>;
  declare tags$: RelationEntitiesObservable<typeof Target>;
}

class Target {
  id = TARGET_ID;
}

class Child {
  id = CHILD_ID;
  declare owner$: RelationEntityObservable<typeof Owner>;
}

class OwnerTarget {
  id = CHILD_ID;
  ownersId = OWNER_ID;
  tagsId = TARGET_ID;
}

Object.defineProperty(OwnerTarget, METADATA, {
  value: { name: 'OwnerTarget', namespace: 'public' }
});

type RelationStatus = {
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
  mappedProperty: 'owners',
  mappedNamespace: 'public',
  columnName: 'target_id',
  nullable: true
} satisfies EntityRelationManyToOneMetadata;

const ONE_TO_ONE_RELATION = {
  name: 'target',
  kind: RelationKind.ONE_TO_ONE,
  mappedEntity: 'Target',
  mappedProperty: 'owner',
  mappedNamespace: 'public',
  columnName: 'target_id',
  nullable: true
} satisfies EntityRelationOneToOneMetadata;

const ONE_TO_MANY_RELATION = {
  name: 'children',
  kind: RelationKind.ONE_TO_MANY,
  mappedEntity: 'Child',
  mappedProperty: 'owner',
  mappedNamespace: 'public'
} satisfies EntityRelationOneToManyMetadata;

const MANY_TO_MANY_RELATION = {
  name: 'tags',
  kind: RelationKind.MANY_TO_MANY,
  mappedEntity: 'Target',
  mappedProperty: 'owners',
  mappedNamespace: 'public',
  columnName: 'tags',
  junctionEntityType: OwnerTarget
} satisfies EntityRelationManyToManyMetadata;

const SINGLE_RELATION_CASES: readonly SingleRelationCase[] = [
  { label: 'MANY_TO_ONE', relation: MANY_TO_ONE_RELATION },
  { label: 'ONE_TO_ONE', relation: ONE_TO_ONE_RELATION }
];

const createStatus = (): RelationStatus => {
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

const withStatus = <T extends object>(entity: T, status: RelationStatus): T => {
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
  junctionRepository?: object
): EntityManagerHarness => {
  const getEntityType = vi.fn<(name: string, namespace?: string) => EntityType | undefined>(name =>
    name === 'OwnerTarget' ? OwnerTarget : mappedEntityType
  );
  const getRepository = vi.fn<(entityType: EntityType) => object>(entityType =>
    entityType === OwnerTarget && junctionRepository ? junctionRepository : mappedRepository
  );
  const em = {
    rxdb: { schemaManager: { getEntityType } },
    getRepository
  } as unknown as EntityManager;

  return { em, getEntityType, getRepository };
};

const createReverseRelation = () => {
  const set = vi.fn<(entity: Owner | null) => void>();
  const remove = vi.fn<() => void>();
  const observable: RelationEntityObservable<typeof Owner> = Object.assign(of<Owner | null>(null), {
    set,
    remove
  });
  return { observable, remove, set };
};

const expectFrozenActions = (observable: object, actionNames: readonly string[]): void => {
  expect(Object.isFrozen(observable)).toBe(true);
  for (const actionName of actionNames) {
    expect(Object.getOwnPropertyDescriptor(observable, actionName)).toMatchObject({
      configurable: false,
      enumerable: false,
      writable: false
    });
  }
};

describe('relation-helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('映射实体不存在时立即拒绝安装关系', () => {
    const repository = createRepository<Target>();
    const { em, getEntityType, getRepository } = createEntityManager(undefined, repository);

    expect(() => relationHelper(MANY_TO_ONE_RELATION, Owner, em)).toThrow('mapped entity not found: Target');
    expect(getEntityType).toHaveBeenCalledWith('Target', 'public');
    expect(getRepository).not.toHaveBeenCalled();
  });

  describe.each(SINGLE_RELATION_CASES)('$label', ({ relation }) => {
    it('按外键读取并用 shareReplay 缓存同一个关系流', async () => {
      const target = new Target();
      const repository = createRepository<Target>();
      repository.get.mockImplementation(id => of(id === TARGET_ID ? target : null));
      const { em } = createEntityManager(Target, repository);
      const owner = withStatus(new Owner(), createStatus());
      owner.targetId = TARGET_ID;

      relationHelper(relation, Owner, em);
      const relation$ = owner.target$;

      await expect(firstValueFrom(relation$)).resolves.toBe(target);
      await expect(firstValueFrom(relation$)).resolves.toBe(target);
      expect(repository.get).toHaveBeenCalledTimes(1);
      expect(repository.get).toHaveBeenCalledWith(TARGET_ID);
      expectFrozenActions(relation$, ['set', 'remove']);
    });

    it('空外键返回 null，重复清空不访问仓库或缓存', async () => {
      const repository = createRepository<Target>();
      const { em } = createEntityManager(Target, repository);
      const status = createStatus();
      const owner = withStatus(new Owner(), status);

      relationHelper(relation, Owner, em);
      const relation$ = owner.target$;

      await expect(firstValueFrom(relation$)).resolves.toBeNull();
      relation$.set(null);
      relation$.remove();

      expect(repository.get).not.toHaveBeenCalled();
      expect(status.addRelationEntity).not.toHaveBeenCalled();
      expect(status.cleanRelationEntity).not.toHaveBeenCalled();
      expect(owner.targetId).toBeNull();
    });

    it('把 bigint 0n 当作合法外键加载关系', async () => {
      const target = new Target();
      const repository = createRepository<Target>();
      repository.get.mockImplementation(id => of((id as unknown) === 0n ? target : null));
      const { em } = createEntityManager(Target, repository);
      const owner = withStatus(new Owner(), createStatus());
      owner.targetId = 0n as unknown as UUID;

      relationHelper(relation, Owner, em);

      await expect(firstValueFrom(owner.target$)).resolves.toBe(target);
      expect(repository.get).toHaveBeenCalledWith(0n);
    });

    it('忽略相同 id，切换实体后更新缓存和关系流', async () => {
      const target = new Target();
      const secondTarget = Object.assign(new Target(), { id: SECOND_TARGET_ID });
      const repository = createRepository<Target>();
      repository.get.mockImplementation(id => of(id === TARGET_ID ? target : secondTarget));
      const { em } = createEntityManager(Target, repository);
      const status = createStatus();
      const owner = withStatus(new Owner(), status);
      owner.targetId = TARGET_ID;

      relationHelper(relation, Owner, em);
      const relation$ = owner.target$;
      await firstValueFrom(relation$);

      relation$.set(target);
      expect(status.addRelationEntity).not.toHaveBeenCalled();
      expect(repository.get).toHaveBeenCalledTimes(1);

      relation$.set(secondTarget);

      expect(status.addRelationEntity).toHaveBeenCalledOnce();
      expect(status.addRelationEntity).toHaveBeenCalledWith(relation, secondTarget);
      expect(owner.targetId).toBe(SECOND_TARGET_ID);
      await expect(firstValueFrom(relation$)).resolves.toBe(secondTarget);
      expect(repository.get).toHaveBeenNthCalledWith(2, SECOND_TARGET_ID);
    });

    it('remove 与 set(null) 都清空外键和单值关系缓存', async () => {
      const target = new Target();
      const repository = createRepository<Target>();
      repository.get.mockReturnValue(of(target));
      const { em } = createEntityManager(Target, repository);
      const status = createStatus();
      const owner = withStatus(new Owner(), status);
      owner.targetId = TARGET_ID;

      relationHelper(relation, Owner, em);
      const relation$ = owner.target$;
      await firstValueFrom(relation$);

      relation$.remove();

      expect(status.cleanRelationEntity).toHaveBeenCalledOnce();
      expect(status.cleanRelationEntity).toHaveBeenCalledWith(relation);
      expect(owner.targetId).toBeNull();
      await expect(firstValueFrom(relation$)).resolves.toBeNull();

      relation$.set(target);
      relation$.set(null);

      expect(status.addRelationEntity).toHaveBeenCalledWith(relation, target);
      expect(status.cleanRelationEntity).toHaveBeenCalledTimes(2);
      expect(status.cleanRelationEntity).toHaveBeenLastCalledWith(relation);
      expect(owner.targetId).toBeNull();
    });

    it('重复访问关系 getter 返回同一个 Observable 引用（记忆化缓存，RXD-012）', () => {
      const repository = createRepository<Target>();
      const { em } = createEntityManager(Target, repository);
      const status = createStatus();
      const owner = withStatus(new Owner(), status);

      relationHelper(relation, Owner, em);

      const first = owner.target$;
      const second = owner.target$;

      expect(second).toBe(first);
      expect(status.setRelationObservableEntry).toHaveBeenCalledOnce();
      expect(status.getRelationObservableEntry).toHaveBeenCalledTimes(2);
    });
  });

  describe('ONE_TO_MANY', () => {
    it('延迟执行 find/count，并使用反向关系维护缓存', async () => {
      const firstChild = new Child();
      const secondChild = Object.assign(new Child(), { id: SECOND_CHILD_ID });
      const firstReverse = createReverseRelation();
      const secondReverse = createReverseRelation();
      firstChild.owner$ = firstReverse.observable;
      secondChild.owner$ = secondReverse.observable;
      const repository = createRepository<Child>();
      repository.findAll.mockReturnValue(of([firstChild, secondChild]));
      repository.count.mockReturnValue(of(2));
      const { em } = createEntityManager(Child, repository);
      const status = createStatus();
      const owner = withStatus(new Owner(), status);

      relationHelper(ONE_TO_MANY_RELATION, Owner, em);
      const relation$ = owner.children$;

      expect(repository.findAll).not.toHaveBeenCalled();
      expect(repository.count).not.toHaveBeenCalled();
      await expect(firstValueFrom(relation$)).resolves.toEqual([firstChild, secondChild]);
      await expect(firstValueFrom(relation$.count$)).resolves.toBe(2);

      const expectedQuery = {
        where: {
          combinator: 'and',
          rules: [{ field: 'ownerId', operator: '=', value: OWNER_ID }]
        }
      };
      expect(repository.findAll).toHaveBeenCalledWith(expectedQuery);
      expect(repository.count).toHaveBeenCalledWith(expectedQuery);

      relation$.add(firstChild, secondChild);
      expect(status.addRelationEntity).toHaveBeenNthCalledWith(1, ONE_TO_MANY_RELATION, firstChild);
      expect(status.addRelationEntity).toHaveBeenNthCalledWith(2, ONE_TO_MANY_RELATION, secondChild);
      expect(firstReverse.set).toHaveBeenCalledWith(owner);
      expect(secondReverse.set).toHaveBeenCalledWith(owner);

      relation$.remove(firstChild, secondChild);
      expect(status.removeRelationEntity).toHaveBeenNthCalledWith(1, ONE_TO_MANY_RELATION, firstChild);
      expect(status.removeRelationEntity).toHaveBeenNthCalledWith(2, ONE_TO_MANY_RELATION, secondChild);
      expect(firstReverse.remove).toHaveBeenCalledOnce();
      expect(secondReverse.remove).toHaveBeenCalledOnce();
      expectFrozenActions(relation$, ['count$', 'add', 'remove']);
    });

    it('重复访问 children$ 返回同一个 Observable 引用（记忆化缓存，RXD-012）', () => {
      const repository = createRepository<Child>();
      const { em } = createEntityManager(Child, repository);
      const status = createStatus();
      const owner = withStatus(new Owner(), status);

      relationHelper(ONE_TO_MANY_RELATION, Owner, em);

      const first = owner.children$;
      const second = owner.children$;

      expect(second).toBe(first);
      expect(status.setRelationObservableEntry).toHaveBeenCalledOnce();
    });
  });

  describe('MANY_TO_MANY', () => {
    it('通过 junction 查找/count，并把 add/remove 委托给关系缓存', async () => {
      const firstTarget = new Target();
      const secondTarget = Object.assign(new Target(), { id: SECOND_TARGET_ID });
      const firstJunction = new OwnerTarget();
      const secondJunction = Object.assign(new OwnerTarget(), { id: SECOND_CHILD_ID, tagsId: SECOND_TARGET_ID });
      const mappedRepository = createRepository<Target>();
      mappedRepository.findAll.mockReturnValue(of([firstTarget, secondTarget]));
      const junctionRepository = createRepository<OwnerTarget>();
      junctionRepository.findAll.mockReturnValue(of([firstJunction, secondJunction]));
      junctionRepository.count.mockReturnValue(of(2));
      const { em, getRepository } = createEntityManager(Target, mappedRepository, junctionRepository);
      const status = createStatus();
      const owner = withStatus(new Owner(), status);

      relationHelper(MANY_TO_MANY_RELATION, Owner, em);
      const relation$ = owner.tags$;

      expect(junctionRepository.findAll).not.toHaveBeenCalled();
      await expect(firstValueFrom(relation$)).resolves.toEqual([firstTarget, secondTarget]);
      await expect(firstValueFrom(relation$.count$)).resolves.toBe(2);

      expect(junctionRepository.findAll).toHaveBeenCalledWith({
        where: {
          combinator: 'and',
          rules: [{ field: 'ownersId', operator: '=', value: OWNER_ID }]
        }
      });
      expect(mappedRepository.findAll).toHaveBeenCalledWith({
        where: {
          combinator: 'and',
          rules: [{ field: 'id', operator: 'in', value: [TARGET_ID, SECOND_TARGET_ID] }]
        }
      });
      expect(junctionRepository.count).toHaveBeenCalledWith({
        where: {
          combinator: 'and',
          rules: [{ field: 'ownersId', operator: '=', value: OWNER_ID }]
        }
      });
      expect(getRepository).toHaveBeenCalledWith(OwnerTarget);
      expect(getRepository).toHaveBeenCalledWith(Target);

      relation$.add(firstTarget, secondTarget);
      relation$.remove(secondTarget);

      expect(status.addRelationEntity).toHaveBeenNthCalledWith(1, MANY_TO_MANY_RELATION, firstTarget);
      expect(status.addRelationEntity).toHaveBeenNthCalledWith(2, MANY_TO_MANY_RELATION, secondTarget);
      expect(status.removeRelationEntity).toHaveBeenCalledWith(MANY_TO_MANY_RELATION, secondTarget);
      expectFrozenActions(relation$, ['count$', 'add', 'remove']);
    });

    it('重复访问 tags$ 返回同一个 Observable 引用（记忆化缓存，RXD-012）', () => {
      const repository = createRepository<Target>();
      const { em } = createEntityManager(Target, repository);
      const status = createStatus();
      const owner = withStatus(new Owner(), status);

      relationHelper(MANY_TO_MANY_RELATION, Owner, em);

      const first = owner.tags$;
      const second = owner.tags$;

      expect(second).toBe(first);
      expect(status.setRelationObservableEntry).toHaveBeenCalledOnce();
    });

    it('缺少 junction 实体时在访问关系属性时失败', () => {
      const repository = createRepository<Target>();
      const { em } = createEntityManager(Target, repository);
      const owner = withStatus(new Owner(), createStatus());
      const invalidRelation = {
        ...MANY_TO_MANY_RELATION,
        junctionEntityType: undefined
      } as unknown as EntityRelationMetadata;

      relationHelper(invalidRelation, Owner, em);

      expect(() => owner.tags$).toThrow('junction entity not found');
    });
  });

  it('关系属性不可枚举，setter 不会覆盖生产 getter', () => {
    const repository = createRepository<Child>();
    const { em } = createEntityManager(Child, repository);
    const owner = withStatus(new Owner(), createStatus());
    const replacement = Object.assign(of<Child[]>([]), {
      count$: of(0),
      add: vi.fn<(entity: Child) => void>(),
      remove: vi.fn<(entity: Child) => void>()
    });

    relationHelper(ONE_TO_MANY_RELATION, Owner, em);
    const descriptor = Object.getOwnPropertyDescriptor(Owner.prototype, 'children$');

    expect(descriptor).toMatchObject({ configurable: true, enumerable: false });
    expect(descriptor?.get).toBeTypeOf('function');
    expect(descriptor?.set).toBeTypeOf('function');
    expect(Object.keys(owner)).not.toContain('children$');
    expect(Reflect.set(owner, 'children$', replacement)).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(owner, 'children$')).toBe(false);
    expect(Object.isFrozen(owner.children$)).toBe(true);
  });
});
