import { EntityType, RxDB } from '@aiao/rxdb';
import {
  Component,
  createEnvironmentInjector,
  EnvironmentInjector,
  EnvironmentProviders,
  inject,
  provideZonelessChangeDetection
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { provideRxDB } from '../rxdb.provider';

// 模拟 RxDB 实例。
const createMockRxDB = () =>
  ({
    entityManager: {
      getRepository: vi.fn()
    },
    disconnectAll: vi.fn().mockResolvedValue(undefined),
    init: vi.fn(),
    close: vi.fn()
  }) as unknown as RxDB;

describe('rxdb.provider', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()]
    });
  });

  describe('provideRxDB', () => {
    it('requires an RxDB factory in its public signature', () => {
      expectTypeOf(provideRxDB).toEqualTypeOf<(useFactory: () => RxDB) => EnvironmentProviders>();
    });

    it('should provide RxDB instance using factory function', () => {
      const mockRxDB = createMockRxDB();
      const factory = vi.fn(() => mockRxDB);

      TestBed.configureTestingModule({
        providers: [provideZonelessChangeDetection(), provideRxDB(factory)]
      });

      const rxdb = TestBed.inject(RxDB);

      expect(factory).toHaveBeenCalled();
      expect(rxdb).toBe(mockRxDB);
    });

    it('should return environment providers', () => {
      const factory = () => createMockRxDB();
      const providers = provideRxDB(factory);

      expect(providers).toBeDefined();
      // makeEnvironmentProviders 返回包含 ɵproviders 的对象。
      expect((providers as unknown as { ɵproviders: unknown[] }).ɵproviders).toBeDefined();
    });

    it('should allow injecting RxDB in components', () => {
      const mockRxDB = createMockRxDB();

      @Component({
        selector: 'rxdb-component',
        template: '<div>Test</div>'
      })
      class TestComponent {
        rxdb = inject(RxDB);
      }

      TestBed.configureTestingModule({
        providers: [provideZonelessChangeDetection(), provideRxDB(() => mockRxDB)]
      });

      const fixture = TestBed.createComponent(TestComponent);
      expect(fixture.componentInstance.rxdb).toBe(mockRxDB);
    });

    it('should throw error when RxDB is not provided', () => {
      @Component({
        selector: 'rxdb-test-no-provider',
        template: '<div>Test</div>'
      })
      class TestComponentWithoutProvider {
        rxdb = inject(RxDB);
      }

      TestBed.configureTestingModule({
        providers: [provideZonelessChangeDetection()]
      });

      expect(() => TestBed.createComponent(TestComponentWithoutProvider)).toThrow();
    });

    it('should provide same instance across multiple injections', () => {
      const mockRxDB = createMockRxDB();
      const factory = vi.fn(() => mockRxDB);

      TestBed.configureTestingModule({
        providers: [provideZonelessChangeDetection(), provideRxDB(factory)]
      });

      const rxdb1 = TestBed.inject(RxDB);
      const rxdb2 = TestBed.inject(RxDB);

      expect(rxdb1).toBe(rxdb2);
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('disconnects the provided database when its environment injector is destroyed', async () => {
      const mockRxDB = createMockRxDB();
      const injector = createEnvironmentInjector([provideRxDB(() => mockRxDB)], TestBed.inject(EnvironmentInjector));
      injector.get(RxDB);

      injector.destroy();
      await vi.waitFor(() => expect(mockRxDB.disconnectAll).toHaveBeenCalledOnce());
    });

    it('should support async initialization in factory', async () => {
      let resolveInit: () => void;
      const initPromise = new Promise<void>(resolve => {
        resolveInit = resolve;
      });

      const mockRxDB = createMockRxDB();
      (mockRxDB.init as ReturnType<typeof vi.fn>).mockReturnValue(initPromise);

      TestBed.configureTestingModule({
        providers: [provideZonelessChangeDetection(), provideRxDB(() => mockRxDB)]
      });

      const rxdb = TestBed.inject(RxDB);
      expect(rxdb).toBe(mockRxDB);

      resolveInit!();
      await initPromise;
    });
  });

  describe('injectRxDB (via inject)', () => {
    it('should inject RxDB instance in injection context', () => {
      const mockRxDB = createMockRxDB();

      TestBed.configureTestingModule({
        providers: [provideZonelessChangeDetection(), provideRxDB(() => mockRxDB)]
      });

      TestBed.runInInjectionContext(() => {
        const rxdb = inject(RxDB);
        expect(rxdb).toBe(mockRxDB);
      });
    });

    it('should access entityManager from injected RxDB', () => {
      const mockRxDB = createMockRxDB();

      TestBed.configureTestingModule({
        providers: [provideZonelessChangeDetection(), provideRxDB(() => mockRxDB)]
      });

      TestBed.runInInjectionContext(() => {
        const rxdb = inject(RxDB);
        expect(rxdb.entityManager).toBeDefined();
        expect(rxdb.entityManager.getRepository).toBeDefined();
      });
    });
  });

  describe('component usage', () => {
    it('should allow using RxDB in component constructor', () => {
      const mockRxDB = createMockRxDB();

      @Component({
        selector: 'rxdb-test-constructor-injection',
        template: '<div>{{ hasRxDB }}</div>'
      })
      class TestConstructorComponent {
        hasRxDB: boolean;
        constructor() {
          const rxdb = inject(RxDB);
          this.hasRxDB = !!rxdb;
        }
      }

      TestBed.configureTestingModule({
        providers: [provideZonelessChangeDetection(), provideRxDB(() => mockRxDB)]
      });

      const fixture = TestBed.createComponent(TestConstructorComponent);
      expect(fixture.componentInstance.hasRxDB).toBe(true);
    });

    it('should allow using RxDB in services', () => {
      const mockRxDB = createMockRxDB();

      TestBed.configureTestingModule({
        providers: [provideZonelessChangeDetection(), provideRxDB(() => mockRxDB)]
      });

      TestBed.runInInjectionContext(() => {
        const rxdb = inject(RxDB);
        rxdb.entityManager.getRepository({} as unknown as EntityType);

        expect(mockRxDB.entityManager.getRepository).toHaveBeenCalled();
      });
    });
  });
});
