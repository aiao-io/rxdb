import { ENTITY_STATIC_TYPES, type UUID } from '@aiao/rxdb';
import { createGraphQueryResult } from '@aiao/rxdb-plugin-graph';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, EMPTY, Subject, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useCount,
  useCountAncestors,
  useCountDescendants,
  useCountNeighbors,
  useFind,
  useFindAll,
  useFindAncestors,
  useFindByCursor,
  useFindDescendants,
  useFindOne,
  useFindOneOrFail,
  useGet,
  useGraphNeighbors,
  useGraphPaths,
  useRepositoryQuery
} from '../hooks';

interface GetOptions {
  id: string;
}

interface QueryOptions {
  where?: { name: string };
}

interface CursorOptions extends QueryOptions {
  limit?: number;
}

interface TreeOptions {
  entityId: string;
}

interface NeighborOptions extends TreeOptions {
  direction?: 'in' | 'out';
  level?: number;
}

interface PathOptions {
  fromId: string;
  maxDepth?: number;
  toId: string;
}

interface TestEntityStaticTypes {
  countOptions: QueryOptions;
  findAllOptions: QueryOptions;
  findByCursorOptions: CursorOptions;
  findNeighborsOptions: NeighborOptions;
  findOneOptions: QueryOptions;
  findOneOrFailOptions: QueryOptions;
  findOptions: QueryOptions;
  findPathsOptions: PathOptions;
  findTreeOptions: TreeOptions;
  getOptions: GetOptions;
  idType: string;
}

class MockEntity {
  static [ENTITY_STATIC_TYPES]: TestEntityStaticTypes = {
    countOptions: {},
    findAllOptions: {},
    findByCursorOptions: {},
    findNeighborsOptions: { entityId: '' },
    findOneOptions: {},
    findOneOrFailOptions: {},
    findOptions: {},
    findPathsOptions: { fromId: '', toId: '' },
    findTreeOptions: { entityId: '' },
    getOptions: { id: '' },
    idType: ''
  };

  static get = vi.fn();
  static findOne = vi.fn();
  static findOneOrFail = vi.fn();
  static find = vi.fn();
  static findByCursor = vi.fn();
  static findAll = vi.fn();
  static count = vi.fn();
  static findDescendants = vi.fn();
  static countDescendants = vi.fn();
  static findAncestors = vi.fn();
  static countAncestors = vi.fn();
  static findNeighbors$ = vi.fn();
  static countNeighbors$ = vi.fn();
  static findPaths$ = vi.fn();

  createdAt = new Date(0);
  id: UUID = '00000000-0000-0000-0000-000000000000';
  name = '';
  updatedAt = new Date(0);
}

const TestEntity = MockEntity;

describe('hooks', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()]
    });
    vi.clearAllMocks();
  });

  describe('useRepositoryQuery', () => {
    it('should return RxDBResource with all signals', () => {
      const mockSubject = new BehaviorSubject({ id: '1', name: 'Test' });
      MockEntity.get.mockReturnValue(mockSubject.asObservable());

      TestBed.runInInjectionContext(() => {
        const resource = useRepositoryQuery(TestEntity, 'get', undefined, { id: '1' });

        expect(resource.value).toBeDefined();
        expect(resource.error).toBeDefined();
        expect(resource.isLoading).toBeDefined();
        expect(resource.isEmpty).toBeDefined();
        expect(resource.hasValue).toBeDefined();
      });
    });

    it('does not start a repository query before any signal is read', () => {
      TestBed.runInInjectionContext(() => {
        useRepositoryQuery(TestEntity, 'get', undefined, { id: '1' });
        TestBed.flushEffects();

        expect(MockEntity.get).not.toHaveBeenCalled();
      });
    });

    // 只有 value 纳入惰性链路时，`@if (isLoading()) {} @else if (hasValue()) {} @else {}`
    // 这种完全合理的模板永远读不到 value()，查询永不启动，UI 永久停在空态。
    it.each(['isLoading', 'hasValue', 'isEmpty', 'error'] as const)(
      'starts the repository query when only %s is read',
      stateKey => {
        MockEntity.get.mockReturnValue(new BehaviorSubject({ id: '1', name: 'Test' }).asObservable());

        TestBed.runInInjectionContext(() => {
          const resource = useRepositoryQuery(TestEntity, 'get', undefined, { id: '1' });
          resource[stateKey]();
          TestBed.flushEffects();

          expect(MockEntity.get).toHaveBeenCalled();
        });
      }
    );

    // React (rxdb-react/src/hooks.ts) 与 Vue (rxdb-vue/src/hooks.ts) 的 isLoading 初值都是 true
    it('reports isLoading as true before the first emission, matching React and Vue', () => {
      MockEntity.get.mockReturnValue(new Subject().asObservable());

      TestBed.runInInjectionContext(() => {
        const resource = useRepositoryQuery(TestEntity, 'get', undefined, { id: '1' });

        expect(resource.isLoading()).toBe(true);
      });
    });

    it('should set isLoading to true when fetching', () => {
      const mockSubject = new Subject();
      MockEntity.get.mockReturnValue(mockSubject.asObservable());

      TestBed.runInInjectionContext(() => {
        const resource = useRepositoryQuery(TestEntity, 'get', undefined, { id: '1' });

        // 读取 value 以触发订阅。
        resource.value();
        TestBed.flushEffects();

        expect(resource.isLoading()).toBe(true);
      });
    });

    it('should set hasValue to true when data is received', () => {
      const mockSubject = new BehaviorSubject({ id: '1', name: 'Test' });
      MockEntity.get.mockReturnValue(mockSubject.asObservable());

      TestBed.runInInjectionContext(() => {
        const resource = useRepositoryQuery(TestEntity, 'get', undefined, { id: '1' });

        // 触发订阅并等待数据。
        resource.value();
        TestBed.flushEffects();

        expect(resource.hasValue()).toBe(true);
      });
    });

    it('should set isEmpty to true for empty array', () => {
      const mockSubject = new BehaviorSubject<MockEntity[]>([]);
      MockEntity.find.mockReturnValue(mockSubject.asObservable());

      TestBed.runInInjectionContext(() => {
        const resource = useRepositoryQuery(TestEntity, 'find', [], {});

        resource.value();
        TestBed.flushEffects();

        expect(resource.isEmpty()).toBe(true);
      });
    });

    it('should set isEmpty to false for non-empty array', () => {
      const mockSubject = new BehaviorSubject([{ id: '1', name: 'Test' }]);
      MockEntity.find.mockReturnValue(mockSubject.asObservable());

      TestBed.runInInjectionContext(() => {
        const resource = useRepositoryQuery(TestEntity, 'find', [], {});

        resource.value();
        TestBed.flushEffects();

        expect(resource.isEmpty()).toBe(false);
      });
    });

    it('should set isEmpty to true for null/undefined value', () => {
      const mockSubject = new BehaviorSubject(null);
      MockEntity.findOne.mockReturnValue(mockSubject.asObservable());

      TestBed.runInInjectionContext(() => {
        const resource = useRepositoryQuery(TestEntity, 'findOne', undefined, {});

        resource.value();
        TestBed.flushEffects();

        expect(resource.isEmpty()).toBe(true);
      });
    });

    it('should set error when observable errors', () => {
      const mockError = new Error('Test error');
      MockEntity.get.mockReturnValue(throwError(() => mockError));

      TestBed.runInInjectionContext(() => {
        const resource = useRepositoryQuery(TestEntity, 'get', undefined, { id: '1' });

        resource.value();
        TestBed.flushEffects();

        expect(resource.error()).toBe(mockError);
        expect(resource.isLoading()).toBe(false);
      });
    });

    it('should support function options for reactive queries', () => {
      const mockSubject = new BehaviorSubject({ id: '1', name: 'Test' });
      MockEntity.get.mockReturnValue(mockSubject.asObservable());

      TestBed.runInInjectionContext(() => {
        const optionsFn = vi.fn(() => ({ id: '1' }));
        const resource = useRepositoryQuery(TestEntity, 'get', undefined, optionsFn);

        resource.value();
        TestBed.flushEffects();

        expect(optionsFn).toHaveBeenCalled();
      });
    });

    it('should update value when observable emits new data', () => {
      const mockSubject = new BehaviorSubject({ id: '1', name: 'Test 1' });
      MockEntity.get.mockReturnValue(mockSubject.asObservable());

      TestBed.runInInjectionContext(() => {
        const resource = useRepositoryQuery(TestEntity, 'get', undefined, { id: '1' });

        resource.value();
        TestBed.flushEffects();

        mockSubject.next({ id: '1', name: 'Test 2' });
        TestBed.flushEffects();

        expect(resource.hasValue()).toBe(true);
      });
    });

    it('re-subscribes with reactive options and resets request state', () => {
      const firstQuery = new Subject<{ id: string; name: string }>();
      const secondQuery = new Subject<{ id: string; name: string }>();
      MockEntity.get.mockReturnValueOnce(firstQuery.asObservable()).mockReturnValueOnce(secondQuery.asObservable());

      TestBed.runInInjectionContext(() => {
        const options = signal({ id: '1' });
        const resource = useRepositoryQuery(TestEntity, 'get', undefined, () => options());
        resource.value();
        TestBed.flushEffects();

        firstQuery.next({ id: '1', name: 'First' });
        expect(resource.hasValue()).toBe(true);

        options.set({ id: '2' });
        TestBed.flushEffects();

        expect(firstQuery.observed).toBe(false);
        expect(MockEntity.get).toHaveBeenLastCalledWith({ id: '2' });
        expect(resource.isLoading()).toBe(true);
        expect(resource.hasValue()).toBe(false);
        expect(resource.isEmpty()).toBeUndefined();
        expect(resource.error()).toBeUndefined();

        secondQuery.next({ id: '2', name: 'Second' });
        expect(resource.value()).toEqual({ id: '2', name: 'Second' });
      });
    });

    it('reports a missing repository method in resource state', () => {
      TestBed.runInInjectionContext(() => {
        const resource = useRepositoryQuery(TestEntity, 'missing', undefined, {});
        resource.value();
        TestBed.flushEffects();

        expect(resource.error()?.message).toBe('Method "missing" not found on EntityType');
        expect(resource.isLoading()).toBe(false);
        expect(resource.hasValue()).toBe(false);
        expect(resource.isEmpty()).toBeUndefined();
      });
    });

    it('reports synchronous repository failures in resource state', () => {
      const queryError = new Error('Query setup failed');
      MockEntity.get.mockImplementation(() => {
        throw queryError;
      });

      TestBed.runInInjectionContext(() => {
        const resource = useRepositoryQuery(TestEntity, 'get', undefined, { id: '1' });
        resource.value();
        TestBed.flushEffects();

        expect(resource.error()).toBe(queryError);
        expect(resource.isLoading()).toBe(false);
        expect(resource.hasValue()).toBe(false);
        expect(resource.isEmpty()).toBeUndefined();
      });
    });

    it('normalizes non-Error observable failures', () => {
      MockEntity.get.mockReturnValue(throwError(() => 'Query failed'));

      TestBed.runInInjectionContext(() => {
        const resource = useRepositoryQuery(TestEntity, 'get', undefined, { id: '1' });
        resource.value();
        TestBed.flushEffects();

        expect(resource.error()).toEqual(new Error('Query failed'));
      });
    });

    it('clears loading when a query completes without a value', () => {
      MockEntity.get.mockReturnValue(EMPTY);

      TestBed.runInInjectionContext(() => {
        const resource = useRepositoryQuery(TestEntity, 'get', undefined, { id: '1' });
        resource.value();
        TestBed.flushEffects();

        expect(resource.isLoading()).toBe(false);
        expect(resource.hasValue()).toBe(false);
      });
    });
  });

  describe('useGet', () => {
    it('should call get method on entity', () => {
      const mockSubject = new BehaviorSubject({ id: '1', name: 'Test' });
      MockEntity.get.mockReturnValue(mockSubject.asObservable());

      TestBed.runInInjectionContext(() => {
        const resource = useGet(TestEntity, { id: '1' });

        resource.value();
        TestBed.flushEffects();

        expect(MockEntity.get).toHaveBeenCalledWith({ id: '1' });
      });
    });

    it('should return undefined as default value', () => {
      const mockSubject = new Subject();
      MockEntity.get.mockReturnValue(mockSubject.asObservable());

      TestBed.runInInjectionContext(() => {
        const resource = useGet(TestEntity, { id: '1' });

        expect(resource.value()).toBeUndefined();
      });
    });
  });

  describe('useFindOne', () => {
    it('should call findOne method on entity', () => {
      const mockSubject = new BehaviorSubject({ id: '1', name: 'Test' });
      MockEntity.findOne.mockReturnValue(mockSubject.asObservable());

      TestBed.runInInjectionContext(() => {
        const resource = useFindOne(TestEntity, { where: { name: 'Test' } });

        resource.value();
        TestBed.flushEffects();

        expect(MockEntity.findOne).toHaveBeenCalledWith({ where: { name: 'Test' } });
      });
    });

    it('should return undefined when not found', () => {
      const mockSubject = new BehaviorSubject(undefined);
      MockEntity.findOne.mockReturnValue(mockSubject.asObservable());

      TestBed.runInInjectionContext(() => {
        const resource = useFindOne(TestEntity, { where: { name: 'NonExistent' } });

        resource.value();
        TestBed.flushEffects();

        expect(resource.isEmpty()).toBe(true);
      });
    });
  });

  describe('useFindOneOrFail', () => {
    it('should call findOneOrFail method on entity', () => {
      const mockSubject = new BehaviorSubject({ id: '1', name: 'Test' });
      MockEntity.findOneOrFail.mockReturnValue(mockSubject.asObservable());

      TestBed.runInInjectionContext(() => {
        const resource = useFindOneOrFail(TestEntity, { where: { name: 'Test' } });

        resource.value();
        TestBed.flushEffects();

        expect(MockEntity.findOneOrFail).toHaveBeenCalled();
      });
    });
  });

  describe('useFind', () => {
    it('should call find method on entity', () => {
      const mockSubject = new BehaviorSubject([{ id: '1', name: 'Test' }]);
      MockEntity.find.mockReturnValue(mockSubject.asObservable());

      TestBed.runInInjectionContext(() => {
        const resource = useFind(TestEntity, { where: { name: 'Test' } });

        resource.value();
        TestBed.flushEffects();

        expect(MockEntity.find).toHaveBeenCalled();
      });
    });

    it('should return empty array as default value', () => {
      const mockSubject = new Subject();
      MockEntity.find.mockReturnValue(mockSubject.asObservable());

      TestBed.runInInjectionContext(() => {
        const resource = useFind(TestEntity, {});

        expect(resource.value()).toEqual([]);
      });
    });

    it('should handle multiple results', () => {
      const mockData = [
        { id: '1', name: 'Test 1' },
        { id: '2', name: 'Test 2' }
      ];
      const mockSubject = new BehaviorSubject(mockData);
      MockEntity.find.mockReturnValue(mockSubject.asObservable());

      TestBed.runInInjectionContext(() => {
        const resource = useFind(TestEntity, {});

        resource.value();
        TestBed.flushEffects();

        expect(resource.isEmpty()).toBe(false);
        expect(resource.hasValue()).toBe(true);
      });
    });
  });

  describe('useFindByCursor', () => {
    it('should call findByCursor method on entity', () => {
      const mockSubject = new BehaviorSubject([{ id: '1', name: 'Test' }]);
      MockEntity.findByCursor.mockReturnValue(mockSubject.asObservable());

      TestBed.runInInjectionContext(() => {
        const resource = useFindByCursor(TestEntity, { limit: 10 });

        resource.value();
        TestBed.flushEffects();

        expect(MockEntity.findByCursor).toHaveBeenCalledWith({ limit: 10 });
      });
    });
  });

  describe('useFindAll', () => {
    it('should call findAll method on entity', () => {
      const mockSubject = new BehaviorSubject([{ id: '1', name: 'Test' }]);
      MockEntity.findAll.mockReturnValue(mockSubject.asObservable());

      TestBed.runInInjectionContext(() => {
        const resource = useFindAll(TestEntity, {});

        resource.value();
        TestBed.flushEffects();

        expect(MockEntity.findAll).toHaveBeenCalled();
      });
    });
  });

  describe('useCount', () => {
    it('should call count method on entity', () => {
      const mockSubject = new BehaviorSubject(5);
      MockEntity.count.mockReturnValue(mockSubject.asObservable());

      TestBed.runInInjectionContext(() => {
        const resource = useCount(TestEntity, {});

        resource.value();
        TestBed.flushEffects();

        expect(MockEntity.count).toHaveBeenCalled();
      });
    });

    it('should return number value', () => {
      const mockSubject = new BehaviorSubject(10);
      MockEntity.count.mockReturnValue(mockSubject.asObservable());

      TestBed.runInInjectionContext(() => {
        const resource = useCount(TestEntity, {});

        resource.value();
        TestBed.flushEffects();

        expect(resource.hasValue()).toBe(true);
      });
    });
  });

  describe('useFindDescendants', () => {
    it('should call findDescendants method on entity', () => {
      const mockSubject = new BehaviorSubject([{ id: '1', name: 'Child' }]);
      MockEntity.findDescendants.mockReturnValue(mockSubject.asObservable());

      TestBed.runInInjectionContext(() => {
        const resource = useFindDescendants(TestEntity, { entityId: 'parent-1' });

        resource.value();
        TestBed.flushEffects();

        expect(MockEntity.findDescendants).toHaveBeenCalledWith({ entityId: 'parent-1' });
      });
    });
  });

  describe('useCountDescendants', () => {
    it('should call countDescendants method on entity', () => {
      const mockSubject = new BehaviorSubject(3);
      MockEntity.countDescendants.mockReturnValue(mockSubject.asObservable());

      TestBed.runInInjectionContext(() => {
        const resource = useCountDescendants(TestEntity, { entityId: 'parent-1' });

        resource.value();
        TestBed.flushEffects();

        expect(MockEntity.countDescendants).toHaveBeenCalled();
      });
    });
  });

  describe('useFindAncestors', () => {
    it('should call findAncestors method on entity', () => {
      const mockSubject = new BehaviorSubject([{ id: '1', name: 'Parent' }]);
      MockEntity.findAncestors.mockReturnValue(mockSubject.asObservable());

      TestBed.runInInjectionContext(() => {
        const resource = useFindAncestors(TestEntity, { entityId: 'child-1' });

        resource.value();
        TestBed.flushEffects();

        expect(MockEntity.findAncestors).toHaveBeenCalledWith({ entityId: 'child-1' });
      });
    });
  });

  describe('useCountAncestors', () => {
    it('should call countAncestors method on entity', () => {
      const mockSubject = new BehaviorSubject(2);
      MockEntity.countAncestors.mockReturnValue(mockSubject.asObservable());

      TestBed.runInInjectionContext(() => {
        const resource = useCountAncestors(TestEntity, { entityId: 'child-1' });

        resource.value();
        TestBed.flushEffects();

        expect(MockEntity.countAncestors).toHaveBeenCalled();
      });
    });
  });

  describe('useGraphNeighbors', () => {
    it('should call findNeighbors$ method on entity', () => {
      const friend = Object.assign(new MockEntity(), { id: '2' as UUID, name: 'Friend' });
      const mockSubject = new BehaviorSubject(
        createGraphQueryResult(
          [
            {
              node: friend,
              edge: { sourceId: '1', targetId: '2', direction: 'out' as const },
              level: 1
            }
          ],
          true
        )
      );
      MockEntity.findNeighbors$.mockReturnValue(mockSubject.asObservable());

      TestBed.runInInjectionContext(() => {
        const resource = useGraphNeighbors(TestEntity, {
          entityId: 'user-1',
          direction: 'out',
          level: 1
        });

        resource.value();
        TestBed.flushEffects();

        expect(MockEntity.findNeighbors$).toHaveBeenCalledWith({
          entityId: 'user-1',
          direction: 'out',
          level: 1
        });
        expect(resource.value().truncated).toBe(true);
        expect(resource.value()[0]?.node.name).toBe('Friend');
      });
    });
  });

  describe('useCountNeighbors', () => {
    it('should call countNeighbors$ method on entity', () => {
      const mockSubject = new BehaviorSubject(5);
      MockEntity.countNeighbors$.mockReturnValue(mockSubject.asObservable());

      TestBed.runInInjectionContext(() => {
        const resource = useCountNeighbors(TestEntity, { entityId: 'user-1' });

        resource.value();
        TestBed.flushEffects();

        expect(MockEntity.countNeighbors$).toHaveBeenCalled();
      });
    });

    it('should return 0 as default value', () => {
      const mockSubject = new Subject();
      MockEntity.countNeighbors$.mockReturnValue(mockSubject.asObservable());

      TestBed.runInInjectionContext(() => {
        const resource = useCountNeighbors(TestEntity, { entityId: 'user-1' });

        expect(resource.value()).toBe(0);
      });
    });
  });

  describe('useGraphPaths', () => {
    it('should call findPaths$ method on entity', () => {
      const from = Object.assign(new MockEntity(), { id: '1' as UUID });
      const to = Object.assign(new MockEntity(), { id: '2' as UUID });
      const mockPaths = createGraphQueryResult(
        [
          {
            nodes: [from, to],
            edges: [{ sourceId: '1', targetId: '2' }],
            length: 1
          }
        ],
        true
      );
      const mockSubject = new BehaviorSubject(mockPaths);
      MockEntity.findPaths$.mockReturnValue(mockSubject.asObservable());

      TestBed.runInInjectionContext(() => {
        const resource = useGraphPaths(TestEntity, {
          fromId: 'user-1',
          toId: 'user-2',
          maxDepth: 5
        });

        resource.value();
        TestBed.flushEffects();

        expect(MockEntity.findPaths$).toHaveBeenCalledWith({
          fromId: 'user-1',
          toId: 'user-2',
          maxDepth: 5
        });
        expect(resource.value().truncated).toBe(true);
        expect(resource.value()[0]?.nodes.map(node => node.id)).toEqual(['1', '2']);
      });
    });

    it('should return empty array as default value', () => {
      const mockSubject = new Subject();
      MockEntity.findPaths$.mockReturnValue(mockSubject.asObservable());

      TestBed.runInInjectionContext(() => {
        const resource = useGraphPaths(TestEntity, { fromId: '1', toId: '2' });

        expect(resource.value()).toEqual([]);
      });
    });
  });

  describe('concurrent hook usage', () => {
    it('should handle multiple hooks simultaneously', () => {
      const getSubject = new BehaviorSubject({ id: '1', name: 'Test' });
      const findSubject = new BehaviorSubject([{ id: '1', name: 'Test' }]);
      const countSubject = new BehaviorSubject(5);

      MockEntity.get.mockReturnValue(getSubject.asObservable());
      MockEntity.find.mockReturnValue(findSubject.asObservable());
      MockEntity.count.mockReturnValue(countSubject.asObservable());

      TestBed.runInInjectionContext(() => {
        const getResource = useGet(TestEntity, { id: '1' });
        const findResource = useFind(TestEntity, {});
        const countResource = useCount(TestEntity, {});

        getResource.value();
        findResource.value();
        countResource.value();
        TestBed.flushEffects();

        expect(getResource.hasValue()).toBe(true);
        expect(findResource.hasValue()).toBe(true);
        expect(countResource.hasValue()).toBe(true);
      });
    });
  });
});
