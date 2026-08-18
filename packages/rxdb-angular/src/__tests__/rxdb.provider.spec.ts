import { EntityType, RxDB } from '@aiao/rxdb';
import {
  ApplicationInitStatus,
  Component,
  createEnvironmentInjector,
  EnvironmentInjector,
  EnvironmentProviders,
  inject,
  provideZonelessChangeDetection
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { provideRxDB, useRxDB, useRxDBOptional, type RxDBSource } from '../rxdb.provider';

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

/**
 * 等 app initializer 跑完。
 *
 * @remarks
 * 不必自己触发：`TestBed.inject` 会 finalize 测试模块，而 finalize 的最后一步就是
 * `runInitializers()`（`@internal`，不在公开类型里）。这里只等它的结果。
 */
const settleInitializers = async (): Promise<void> => {
  await TestBed.inject(ApplicationInitStatus).donePromise;
};

describe('rxdb.provider', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()]
    });
  });

  describe('provideRxDB', () => {
    it('accepts the tri-framework RxDBSource union in its public signature', () => {
      expectTypeOf(provideRxDB).toEqualTypeOf<(source: RxDBSource) => EnvironmentProviders>();
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

  // 三框架统一异步契约：provider 收 `RxDB | Promise<RxDB> | (() => RxDB | Promise<RxDB>)`，
  // 读取分 useRxDB（未就绪抛错）与 useRxDBOptional（未就绪返回 undefined）两条。
  describe('异步 source', () => {
    it('accepts a ready instance without wrapping it in a factory', () => {
      const mockRxDB = createMockRxDB();

      TestBed.configureTestingModule({
        providers: [provideZonelessChangeDetection(), provideRxDB(mockRxDB)]
      });

      expect(TestBed.inject(RxDB)).toBe(mockRxDB);
    });

    it('awaits an async source in the app initializer so inject(RxDB) stays synchronous', async () => {
      const mockRxDB = createMockRxDB();

      TestBed.configureTestingModule({
        providers: [provideZonelessChangeDetection(), provideRxDB(() => Promise.resolve(mockRxDB))]
      });

      await settleInitializers();

      expect(TestBed.inject(RxDB)).toBe(mockRxDB);
    });

    it('accepts a bare promise', async () => {
      const mockRxDB = createMockRxDB();

      TestBed.configureTestingModule({
        providers: [provideZonelessChangeDetection(), provideRxDB(Promise.resolve(mockRxDB))]
      });

      await settleInitializers();

      expect(TestBed.inject(RxDB)).toBe(mockRxDB);
    });

    it('separates "not ready" from "no provider" before an async source settles', () => {
      TestBed.configureTestingModule({
        providers: [provideZonelessChangeDetection(), provideRxDB(() => Promise.resolve(createMockRxDB()))]
      });

      TestBed.runInInjectionContext(() => {
        expect(() => useRxDB()).toThrow(/RxDB is not ready yet/);
        expect(useRxDBOptional()).toBeUndefined();
      });
    });

    it('returns undefined from useRxDBOptional when no provider exists', () => {
      TestBed.runInInjectionContext(() => {
        expect(useRxDBOptional()).toBeUndefined();
      });
    });

    // initializer 一旦 reject，Angular 会中止 bootstrap —— 窗口全白，为这种失败准备的
    // 应用内诊断面板反而被失败本身挡在门外。所以错误留到读取时再抛。
    it('never rejects the app initializer, and rethrows the original error on read', async () => {
      const failure = new Error('storage unavailable');

      TestBed.configureTestingModule({
        providers: [provideZonelessChangeDetection(), provideRxDB(() => Promise.reject(failure))]
      });

      await expect(settleInitializers()).resolves.toBeUndefined();

      TestBed.runInInjectionContext(() => {
        expect(() => useRxDB()).toThrow(failure);
        expect(useRxDBOptional()).toBeUndefined();
      });
    });
  });

  // 所有权规则：provider 只销毁自己造的东西。调用方传进来的实例不该被顺手断掉 ——
  // 否则一个模块级单例会随某个子注入器的销毁而失效，且没有人会去重连。
  describe('生命周期所有权', () => {
    it('leaves a caller-supplied instance alone when its injector is destroyed', async () => {
      const mockRxDB = createMockRxDB();
      const injector = createEnvironmentInjector([provideRxDB(mockRxDB)], TestBed.inject(EnvironmentInjector));
      injector.get(RxDB);

      injector.destroy();
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockRxDB.disconnectAll).not.toHaveBeenCalled();
    });

    it('disconnects an async source that settles after the injector is destroyed', async () => {
      const mockRxDB = createMockRxDB();
      let settle: (value: RxDB) => void = () => undefined;
      const pending = new Promise<RxDB>(resolve => (settle = resolve));
      const injector = createEnvironmentInjector([provideRxDB(() => pending)], TestBed.inject(EnvironmentInjector));
      // 这次读取只为把 holder 建出来（子注入器没有 app initializer 替它等），必然抛「未就绪」。
      expect(() => injector.get(RxDB)).toThrow(/RxDB is not ready yet/);

      injector.destroy();
      settle(mockRxDB);

      await vi.waitFor(() => expect(mockRxDB.disconnectAll).toHaveBeenCalledOnce());
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
