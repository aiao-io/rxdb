/**
 * React 树 wrapper 的有界复验；可控 Observable 不冒充真实 TreeRepository/SQL。
 *
 * @remarks
 * 根级 StrictMode 用 reactStrictMode 开关，订阅和清理次数必须真实断言。
 * provider 测试由消费方显式选择实体静态仓储，不假定 tree hook 自动读取 context。
 */
import { ENTITY_STATIC_TYPES, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBProvider, useRxDB } from '@aiao/rxdb-react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { createElement, useLayoutEffect, type PropsWithChildren } from 'react';
import { Observable, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCountAncestors, useCountDescendants, useFindAncestors, useFindDescendants } from '../index.js';

interface TreeOptions {
  entityId: number | string;
  level?: number;
}

class TreeShape {
  static [ENTITY_STATIC_TYPES]: {
    idType: number | string;
    countAncestorsOptions: TreeOptions;
    countDescendantsOptions: TreeOptions;
    findAncestorsOptions: TreeOptions;
    findDescendantsOptions: TreeOptions;
  };

  readonly createdAt = new Date(0);
  readonly updatedAt = new Date(0);
  readonly parentId: number | string | null = null;

  constructor(readonly id: number | string = 0) {}
}

const queries = {
  findDescendants: vi.fn<(options: TreeOptions) => Observable<TreeShape[]>>(),
  countDescendants: vi.fn<(options: TreeOptions) => Observable<number>>(),
  findAncestors: vi.fn<(options: TreeOptions) => Observable<TreeShape[]>>(),
  countAncestors: vi.fn<(options: TreeOptions) => Observable<number>>()
};

class TreeNode extends TreeShape {
  static findDescendants = queries.findDescendants;
  static countDescendants = queries.countDescendants;
  static findAncestors = queries.findAncestors;
  static countAncestors = queries.countAncestors;
}

const otherQuery = vi.fn<(options: TreeOptions) => Observable<TreeShape[]>>();

class OtherTreeNode extends TreeShape {
  static findDescendants = otherQuery;
}

const flatQuery = vi.fn<(options: TreeOptions) => Observable<TreeShape[]>>();

class WithoutTreeMethods extends TreeShape {
  static find = flatQuery;
}

const createProbe = <T>() => {
  const source = new Subject<T>();
  const counts = { subscribed: 0, cleaned: 0, active: 0 };
  const observable = new Observable<T>(subscriber => {
    counts.subscribed += 1;
    counts.active += 1;
    const subscription = source.subscribe(subscriber);

    return () => {
      counts.cleaned += 1;
      counts.active -= 1;
      subscription.unsubscribe();
    };
  });

  return { source, counts, observable };
};

const createProbes = () => ({
  descendants: createProbe<TreeShape[]>(),
  descendantCount: createProbe<number>(),
  ancestors: createProbe<TreeShape[]>(),
  ancestorCount: createProbe<number>()
});

const useTreeResources = (options: TreeOptions) => ({
  descendants: useFindDescendants(TreeNode, options),
  descendantCount: useCountDescendants(TreeNode, options),
  ancestors: useFindAncestors(TreeNode, options),
  ancestorCount: useCountAncestors(TreeNode, options)
});

let probes: ReturnType<typeof createProbes>;
const databases: RxDB[] = [];

beforeEach(() => {
  vi.resetAllMocks();
  probes = createProbes();
  queries.findDescendants.mockReturnValue(probes.descendants.observable);
  queries.countDescendants.mockReturnValue(probes.descendantCount.observable);
  queries.findAncestors.mockReturnValue(probes.ancestors.observable);
  queries.countAncestors.mockReturnValue(probes.ancestorCount.observable);
});

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  await Promise.all(databases.splice(0).map(database => database.destroy()));
});

describe('R2-03 树 React 参数与生命周期', () => {
  it('四个 hook 原样区分数值 0 与字符串 0，并保留默认值和空态', () => {
    const initialProps: TreeOptions = { entityId: 0 };
    const hook = renderHook(({ entityId }: TreeOptions) => useTreeResources({ entityId, level: 1 }), {
      initialProps
    });

    expect(hook.result.current.descendants.value).toEqual([]);
    expect(hook.result.current.ancestors.value).toEqual([]);
    expect(hook.result.current.descendantCount.value).toBe(0);
    expect(hook.result.current.ancestorCount.value).toBe(0);
    expect(Object.values(hook.result.current).map(resource => resource.hasValue)).toEqual([false, false, false, false]);
    expect(Object.values(queries).map(query => query.mock.calls[0]?.[0])).toEqual([
      { entityId: 0, level: 1 },
      { entityId: 0, level: 1 },
      { entityId: 0, level: 1 },
      { entityId: 0, level: 1 }
    ]);

    act(() => {
      probes.descendants.source.next([]);
      probes.ancestors.source.next([]);
      probes.descendantCount.source.next(0);
      probes.ancestorCount.source.next(0);
    });
    expect(hook.result.current.descendants.isEmpty).toBe(true);
    expect(hook.result.current.ancestors.isEmpty).toBe(true);
    expect(hook.result.current.descendantCount.isEmpty).toBe(false);
    expect(hook.result.current.ancestorCount.isEmpty).toBe(false);

    hook.rerender({ entityId: '0' });
    expect(Object.values(hook.result.current).every(resource => resource.isLoading && !resource.hasValue)).toBe(true);
    expect(Object.values(queries).map(query => query.mock.calls[1]?.[0])).toEqual([
      { entityId: '0', level: 1 },
      { entityId: '0', level: 1 },
      { entityId: '0', level: 1 },
      { entityId: '0', level: 1 }
    ]);
    expect(Object.values(probes).map(probe => probe.counts)).toEqual(
      Array.from({ length: 4 }, () => ({ subscribed: 2, cleaned: 1, active: 1 }))
    );
  });

  it('根级 StrictMode 对四个 hook 真正执行 setup-cleanup-setup，卸载全部释放', () => {
    const hook = renderHook(() => useTreeResources({ entityId: 0 }), { reactStrictMode: true });

    expect(Object.values(probes).map(probe => probe.counts)).toEqual(
      Array.from({ length: 4 }, () => ({ subscribed: 2, cleaned: 1, active: 1 }))
    );
    act(() => {
      probes.descendants.source.next([new TreeNode(1)]);
      probes.ancestors.source.next([new TreeNode(0)]);
      probes.descendantCount.source.next(1);
      probes.ancestorCount.source.next(0);
    });
    expect(Object.values(hook.result.current).every(resource => resource.hasValue && !resource.isLoading)).toBe(true);
    const snapshot = hook.result.current;

    hook.unmount();
    act(() => {
      probes.descendants.source.next([new TreeNode(99)]);
      probes.ancestorCount.source.error(new Error('卸载后晚到'));
    });
    expect(hook.result.current).toBe(snapshot);
    expect(Object.values(probes).map(probe => probe.counts)).toEqual(
      Array.from({ length: 4 }, () => ({ subscribed: 2, cleaned: 2, active: 0 }))
    );
  });

  it('快速切换参数使旧结果、旧错误和 layout effect 迟到值失效', () => {
    const first = createProbe<TreeShape[]>();
    const second = createProbe<TreeShape[]>();
    const third = createProbe<TreeShape[]>();
    const sources = new Map<number | string, Observable<TreeShape[]>>([
      [0, first.observable],
      [1, second.observable],
      [2, third.observable]
    ]);
    queries.findDescendants.mockImplementation(options => {
      const observable = sources.get(options.entityId);
      if (observable === undefined) throw new Error('复验参数未登记');
      return observable;
    });
    const layoutActiveCounts: number[] = [];
    const hook = renderHook(
      ({ entityId }: TreeOptions) => {
        const resource = useFindDescendants(TreeNode, { entityId });
        useLayoutEffect(() => {
          if (entityId === 0) return;
          layoutActiveCounts.push(first.counts.active);
          first.source.next([new TreeNode(99)]);
        }, [entityId]);
        return resource;
      },
      { initialProps: { entityId: 0 } }
    );

    act(() => first.source.next([new TreeNode(10)]));
    hook.rerender({ entityId: 1 });
    expect(hook.result.current.value.map(node => node.id)).toEqual([10]);
    expect(hook.result.current.hasValue).toBe(false);
    expect(hook.result.current.isLoading).toBe(true);
    expect(layoutActiveCounts).toEqual([1]);
    hook.rerender({ entityId: 2 });
    act(() => {
      first.source.error(new Error('旧参数错误'));
      second.source.next([new TreeNode(88)]);
      third.source.next([new TreeNode(20)]);
    });
    expect(hook.result.current.value.map(node => node.id)).toEqual([20]);
    expect(hook.result.current.error).toBeUndefined();
    expect(hook.result.current.hasValue).toBe(true);
    expect([first.counts.active, second.counts.active, third.counts.active]).toEqual([0, 0, 1]);
    hook.unmount();
    expect(third.counts.active).toBe(0);
  });

  it.each(['object', 'factory'] as const)('%s 同值新引用重渲染不重订阅，改 level 才重订阅', mode => {
    const hook = renderHook(
      ({ level }: { level: number }) =>
        useFindDescendants(TreeNode, mode === 'factory' ? () => ({ entityId: 0, level }) : { entityId: 0, level }),
      { initialProps: { level: 1 } }
    );

    hook.rerender({ level: 1 });
    expect(queries.findDescendants).toHaveBeenCalledTimes(1);
    hook.rerender({ level: 2 });
    expect(queries.findDescendants).toHaveBeenCalledTimes(2);
    expect(probes.descendants.counts).toEqual({ subscribed: 2, cleaned: 1, active: 1 });
  });

  it('四个缺失树方法显式写入 error，不 fallback 到 find', () => {
    const hook = renderHook(() => ({
      descendants: useFindDescendants(WithoutTreeMethods, { entityId: 0 }),
      descendantCount: useCountDescendants(WithoutTreeMethods, { entityId: 0 }),
      ancestors: useFindAncestors(WithoutTreeMethods, { entityId: 0 }),
      ancestorCount: useCountAncestors(WithoutTreeMethods, { entityId: 0 })
    }));

    expect(Object.values(hook.result.current).map(resource => resource.error?.message)).toEqual([
      'Method "findDescendants" not found on EntityType',
      'Method "countDescendants" not found on EntityType',
      'Method "findAncestors" not found on EntityType',
      'Method "countAncestors" not found on EntityType'
    ]);
    expect(Object.values(hook.result.current).every(resource => !resource.isLoading && !resource.hasValue)).toBe(true);
    expect(flatQuery).not.toHaveBeenCalled();
  });

  it('同步抛错和 Observable error 原样进入四个资源状态', () => {
    const failure = new Error('树查询失败');
    queries.findDescendants.mockImplementation(() => {
      throw failure;
    });
    queries.countDescendants.mockReturnValue(throwError(() => failure));
    queries.findAncestors.mockReturnValue(throwError(() => failure));
    queries.countAncestors.mockReturnValue(throwError(() => failure));
    const hook = renderHook(() => useTreeResources({ entityId: 0 }));

    expect(Object.values(hook.result.current).map(resource => resource.error)).toEqual([
      failure,
      failure,
      failure,
      failure
    ]);
    expect(Object.values(hook.result.current).every(resource => !resource.isLoading && !resource.hasValue)).toBe(true);
  });

  it('已有成功值后出错保留旧 value，但清空成功和空态标记', () => {
    const hook = renderHook(() => useFindDescendants(TreeNode, { entityId: 0 }));
    const failure = new Error('更新树失败');

    act(() => probes.descendants.source.next([new TreeNode(1)]));
    act(() => probes.descendants.source.error(failure));
    expect(hook.result.current.value.map(node => node.id)).toEqual([1]);
    expect(hook.result.current.error).toBe(failure);
    expect(hook.result.current.hasValue).toBe(false);
    expect(hook.result.current.isEmpty).toBeUndefined();
    expect(hook.result.current.isLoading).toBe(false);
    expect(probes.descendants.counts.active).toBe(0);
  });

  it('非幂等 options factory 在 render 明确抛错，未执行仓储查询', () => {
    let entityId = 0;
    const useInvalidOptions = () => useFindDescendants(TreeNode, () => ({ entityId: entityId++ }));

    expect(() => renderHook(useInvalidOptions)).toThrow('RxDB query options factory must return a stable value');
    expect(queries.findDescendants).not.toHaveBeenCalled();
  });

  it('多 root/provider 的实体选择切换隔离结果，单 root 卸载不取消另一个', () => {
    const firstDatabase = new RxDB({
      dbName: 'review-round2-tree-react-first',
      entities: [],
      multiInstance: false,
      sync: { type: SyncType.None, local: { adapter: 'not-connected' } }
    });
    const secondDatabase = new RxDB({
      dbName: 'review-round2-tree-react-second',
      entities: [],
      multiInstance: false,
      sync: { type: SyncType.None, local: { adapter: 'not-connected' } }
    });
    databases.push(firstDatabase, secondDatabase);
    let currentDatabase = firstDatabase;
    const other = createProbe<TreeShape[]>();
    otherQuery.mockReturnValue(other.observable);
    const FirstProvider = ({ children }: PropsWithChildren) =>
      createElement(RxDBProvider, { db: currentDatabase }, children);
    const SecondProvider = ({ children }: PropsWithChildren) =>
      createElement(RxDBProvider, { db: secondDatabase }, children);
    const useSelectedTree = () => {
      const database = useRxDB();
      const EntityType = database === firstDatabase ? TreeNode : OtherTreeNode;
      return { database, resource: useFindDescendants(EntityType, { entityId: 0 }) };
    };
    const first = renderHook(useSelectedTree, { wrapper: FirstProvider });
    const second = renderHook(useSelectedTree, { wrapper: SecondProvider });

    act(() => probes.descendants.source.next([new TreeNode(10)]));
    expect(first.result.current.resource.value.map(node => node.id)).toEqual([10]);
    expect(second.result.current.resource.hasValue).toBe(false);
    currentDatabase = secondDatabase;
    first.rerender();
    expect(first.result.current.database).toBe(secondDatabase);
    expect(first.result.current.resource.value).toEqual([]);
    expect(first.result.current.resource.hasValue).toBe(false);
    act(() => {
      probes.descendants.source.next([new TreeNode(99)]);
      other.source.next([new OtherTreeNode(20)]);
    });
    expect(first.result.current.resource.value.map(node => node.id)).toEqual([20]);
    expect(second.result.current.resource.value.map(node => node.id)).toEqual([20]);
    first.unmount();
    expect(other.counts.active).toBe(1);
    act(() => other.source.next([new OtherTreeNode(30)]));
    expect(second.result.current.resource.value.map(node => node.id)).toEqual([30]);
    second.unmount();
    expect(other.counts.active).toBe(0);
    expect(probes.descendants.counts.active).toBe(0);
  });
});
