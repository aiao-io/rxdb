import { ENTITY_STATIC_TYPES, PropertyType, RxDB, RxDBError, SyncType } from '@aiao/rxdb';
import { provideRxDB, useRxDB } from '@aiao/rxdb-angular';
import {
  TreeAdjacencyListEntityBase,
  TreeEntity,
  TreeRepository,
  rxDBPluginTree,
  type FindTreeOptions
} from '@aiao/rxdb-plugin-tree';
import {
  ChangeDetectionStrategy,
  Component,
  EnvironmentInjector,
  Input,
  createEnvironmentInjector,
  provideZonelessChangeDetection,
  runInInjectionContext,
  signal
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Observable } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCountAncestors, useCountDescendants, useFindAncestors, useFindDescendants } from '../index.js';

const databases: RxDB[] = [];

const createCoreFixture = () => {
  @TreeEntity({
    name: 'ReviewRound2AngularTree',
    properties: [
      { name: 'id', type: PropertyType.integer, primary: true, readonly: true },
      { name: 'label', type: PropertyType.string }
    ]
  })
  class Node extends TreeAdjacencyListEntityBase<number> {
    declare static [ENTITY_STATIC_TYPES]: {
      idType: number;
      findDescendantsOptions: FindTreeOptions<typeof Node>;
      countDescendantsOptions: FindTreeOptions<typeof Node>;
      findAncestorsOptions: FindTreeOptions<typeof Node>;
      countAncestorsOptions: FindTreeOptions<typeof Node>;
    };

    declare label: string;
  }

  const database = new RxDB({
    dbName: 'review-round2-angular-tree',
    entities: [Node],
    sync: { type: SyncType.None, local: { adapter: 'controlled-boundary' } },
    multiInstance: false
  });
  databases.push(database);
  database.use(rxDBPluginTree);
  database.init();

  type PendingQuery = {
    options: FindTreeOptions<typeof Node>;
    resolve: (nodes: Node[]) => void;
    reject: (cause: unknown) => void;
  };
  const pending: PendingQuery[] = [];
  const backend = {
    findDescendants: vi.fn((options: FindTreeOptions<typeof Node>): Promise<Node[]> => {
      const deferred = Promise.withResolvers<Node[]>();
      pending.push({ options, resolve: deferred.resolve, reject: deferred.reject });
      return deferred.promise;
    }),
    findAncestors: vi.fn(async (): Promise<Node[]> => []),
    countDescendants: vi.fn(async (): Promise<number> => 0),
    countAncestors: vi.fn(async (): Promise<number> => 0)
  };
  let subscriptions = 0;
  const primary = new Observable<typeof backend>(subscriber => {
    subscriptions += 1;
    subscriber.next(backend);
    return () => {
      subscriptions -= 1;
    };
  });
  const repository = database.entityManager.getRepository<typeof Node, TreeRepository<typeof Node>>(Node);
  Object.defineProperty(repository, 'primary$', { value: primary });

  return {
    Node,
    database,
    backend,
    pending,
    repository,
    get subscriptions(): number {
      return subscriptions;
    },
    row: (id: number, label: string) => database.entityManager.createEntityRef(Node, { id, label, parentId: null })
  };
};

const settle = async <T>(fixture: ComponentFixture<T>): Promise<void> => {
  await Promise.resolve();
  TestBed.tick();
  await fixture.whenStable();
  fixture.detectChanges();
};

const createComponent = (core: ReturnType<typeof createCoreFixture>) => {
  @Component({
    selector: 'review-round2-tree-consumer',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
      @if (nodes.error(); as error) {
        <p role="alert">{{ error.message }}</p>
      } @else if (nodes.isLoading()) {
        <p data-state="loading">loading</p>
      } @else if (nodes.isEmpty()) {
        <p data-state="empty">empty</p>
      } @else {
        @for (node of nodes.value(); track node.id) {
          <p>{{ node.label }}</p>
        }
      }
      <span>{{ second.isLoading() }}</span>
    `
  })
  class Consumer {
    private readonly entityId = signal(0);

    readonly nodes = useFindDescendants(core.Node, () => ({ entityId: this.entityId(), level: 1 }));
    readonly second = useFindDescendants(core.Node, () => ({ entityId: this.entityId(), level: 1 }));

    @Input({ required: true })
    set rootId(value: number) {
      this.entityId.set(value);
    }
  }

  return TestBed.createComponent(Consumer);
};

beforeEach(() => {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
});

afterEach(async () => {
  TestBed.resetTestingModule();
  await Promise.all(databases.splice(0).map(database => database.destroy()));
});

describe('R2-02 真实 core 注册与 Angular signal 契约', () => {
  it('真实 RxDB 缺 Tree 插件时在 init 拒绝，不退化到普通仓储', () => {
    const core = createCoreFixture();
    const missing = new RxDB({
      dbName: 'review-round2-tree-missing',
      entities: [core.Node],
      sync: { type: SyncType.None },
      multiInstance: false
    });
    databases.push(missing);
    expect(() => missing.init()).toThrow("Repository 'TreeRepository' not found");
  });

  it('真实 Tree 插件拒绝 QueryCache 生效组合', () => {
    const core = createCoreFixture();
    const cached = new RxDB({
      dbName: 'review-round2-tree-cache',
      entities: [core.Node],
      sync: { type: SyncType.QueryCache, local: { adapter: 'local' }, remote: { adapter: 'remote' } },
      multiInstance: false
    });
    databases.push(cached);
    cached.use(rxDBPluginTree);
    expect(() => cached.init()).toThrow(/TreeRepository.*QueryCache/);
  });

  it('非注入上下文调用四个入口都显式拒绝', () => {
    const core = createCoreFixture();
    const hooks = [useFindDescendants, useCountDescendants, useFindAncestors, useCountAncestors];
    for (const hook of hooks) expect(() => hook(core.Node, { entityId: 0 })).toThrow(/NG0203|injection context/);
  });

  it('实际 TreeRepository 非法 level 错误透明，未触及可控适配器边界', () => {
    const core = createCoreFixture();
    const resource = TestBed.runInInjectionContext(() => useFindDescendants(core.Node, { entityId: 0, level: -1 }));
    expect(core.repository).toBeInstanceOf(TreeRepository);
    resource.isLoading();
    TestBed.tick();
    expect(resource.error()).toBeInstanceOf(RxDBError);
    expect(resource.isLoading()).toBe(false);
    expect(resource.hasValue()).toBe(false);
    expect(core.backend.findDescendants).not.toHaveBeenCalled();
  });

  it('四个方法懒启动、数值 0 不被当空 ID，数组与计数返回保持精确类型', async () => {
    const core = createCoreFixture();
    const resources = TestBed.runInInjectionContext(() => ({
      descendants: useFindDescendants(core.Node, { entityId: 0 }),
      ancestors: useFindAncestors(core.Node, { entityId: 0, level: 1 }),
      descendantCount: useCountDescendants(core.Node, { entityId: 0 }),
      ancestorCount: useCountAncestors(core.Node, { entityId: 0 })
    }));
    TestBed.tick();
    expect(core.subscriptions).toBe(0);
    expect(resources.descendants.value()).toEqual([]);
    expect(resources.ancestors.isLoading()).toBe(true);
    expect(resources.descendantCount.value()).toBe(0);
    expect(resources.ancestorCount.hasValue()).toBe(false);
    TestBed.tick();
    expect(core.backend.findDescendants).toHaveBeenCalledWith({ entityId: 0, level: undefined });
    expect(core.backend.findAncestors).toHaveBeenCalledWith({ entityId: 0, level: 1 });
    expect(core.backend.countDescendants).toHaveBeenCalledWith({ entityId: 0, level: undefined });
    expect(core.backend.countAncestors).toHaveBeenCalledWith({ entityId: 0, level: undefined });
    core.pending[0].resolve([core.row(0, 'zero')]);
    await Promise.resolve();
    TestBed.tick();
    const nodes: InstanceType<typeof core.Node>[] = resources.descendants.value();
    const count: number = resources.descendantCount.value();
    expect(nodes.map(node => node.id)).toEqual([0]);
    expect(count).toBe(0);
    expect(resources.ancestors.isEmpty()).toBe(true);
    expect(resources.descendantCount.isEmpty()).toBe(false);
  });

  it('standalone/OnPush 必填 Input 驱动 signal 快速切换，晚到旧结果不覆盖新 query', async () => {
    const core = createCoreFixture();
    const fixture = createComponent(core);
    fixture.componentRef.setInput('rootId', 0);
    await settle(fixture);
    const old = core.pending[0];
    fixture.componentRef.setInput('rootId', 1);
    fixture.componentRef.setInput('rootId', 2);
    await settle(fixture);
    const current = core.pending[core.pending.length - 1];
    expect(current.options).toEqual({ entityId: 2, level: 1 });
    current.resolve([core.row(2, 'current')]);
    await settle(fixture);
    old.resolve([core.row(0, 'old')]);
    await settle(fixture);
    expect(fixture.componentInstance.nodes.value().map(node => node.id)).toEqual([2]);
    expect(fixture.componentInstance.second.value().map(node => node.id)).toEqual([2]);
    const host: HTMLElement = fixture.nativeElement;
    expect(host.textContent).toContain('current');
    expect(host.textContent).not.toContain('old');
    fixture.destroy();
    expect(core.subscriptions).toBe(0);
  });

  it('真实组件呈现 loading/empty/error，销毁后异步失败不重新订阅', async () => {
    const core = createCoreFixture();
    const fixture = createComponent(core);
    fixture.componentRef.setInput('rootId', 0);
    await settle(fixture);
    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('[data-state="loading"]')).not.toBeNull();
    core.pending[0].resolve([]);
    await settle(fixture);
    expect(host.querySelector('[data-state="empty"]')).not.toBeNull();
    fixture.componentRef.setInput('rootId', 1);
    await settle(fixture);
    const failure = new Error('tree-query-failed');
    core.pending[core.pending.length - 1].reject(failure);
    await settle(fixture);
    expect(fixture.componentInstance.nodes.error()).toBe(failure);
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(failure.message);
    fixture.componentRef.setInput('rootId', 2);
    await settle(fixture);
    const late = core.pending[core.pending.length - 1];
    fixture.destroy();
    expect(core.subscriptions).toBe(0);
    late.reject(new Error('after-destroy'));
    await Promise.resolve();
    expect(fixture.componentInstance.nodes.error()).toBeUndefined();
    expect(core.subscriptions).toBe(0);
  });

  it('子 provider 覆盖不污染父库，同一实例内多资源销毁释放到零', async () => {
    const parent = createCoreFixture();
    const child = createCoreFixture();
    TestBed.configureTestingModule({ providers: [provideRxDB(parent.database)] });
    const parentResource = TestBed.runInInjectionContext(() => {
      expect(useRxDB()).toBe(parent.database);
      return useFindDescendants(parent.Node, { entityId: 0 });
    });
    const injector = createEnvironmentInjector([provideRxDB(child.database)], TestBed.inject(EnvironmentInjector));
    const childResource = runInInjectionContext(injector, () => {
      expect(useRxDB()).toBe(child.database);
      return useFindDescendants(child.Node, { entityId: 1 });
    });
    parentResource.value();
    childResource.value();
    TestBed.tick();
    parent.pending[0].resolve([parent.row(0, 'parent')]);
    child.pending[0].resolve([child.row(1, 'child')]);
    await Promise.resolve();
    TestBed.tick();
    expect(parentResource.value().map(node => node.id)).toEqual([0]);
    expect(childResource.value().map(node => node.id)).toEqual([1]);
    injector.destroy();
    expect(child.subscriptions).toBe(0);
    expect(parent.subscriptions).toBeGreaterThan(0);
    TestBed.resetTestingModule();
    expect(parent.subscriptions).toBe(0);
  });
});
