import { ENTITY_STATIC_TYPES } from '@aiao/rxdb';
import type { RxDBResource, UseOptions } from '@aiao/rxdb-vue';
import { Observable, of, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  computed,
  createApp,
  defineComponent,
  effectScope,
  h,
  isProxy,
  nextTick,
  reactive,
  readonly,
  ref,
  type App,
  type EffectScope,
  type PropType
} from 'vue';

import { useCountAncestors, useCountDescendants, useFindAncestors, useFindDescendants } from '../index.js';

interface TreeOptions {
  entityId: string | number;
  where: { name: string };
}

interface TreeStaticTypes {
  countAncestorsOptions: TreeOptions;
  countDescendantsOptions: TreeOptions;
  findAncestorsOptions: TreeOptions;
  findDescendantsOptions: TreeOptions;
}

const queries = {
  findDescendants: vi.fn<(options: TreeOptions) => Observable<TreeNode[]>>(),
  countDescendants: vi.fn<(options: TreeOptions) => Observable<number>>(),
  findAncestors: vi.fn<(options: TreeOptions) => Observable<TreeNode[]>>(),
  countAncestors: vi.fn<(options: TreeOptions) => Observable<number>>()
};

class TreeNode {
  declare static [ENTITY_STATIC_TYPES]: TreeStaticTypes;
  readonly createdAt = new Date(0);
  readonly parentId: number | null = null;
  readonly updatedAt = new Date(0);

  constructor(readonly id = 1) {}

  static findDescendants(options: TreeOptions): Observable<TreeNode[]> {
    return queries.findDescendants(options);
  }

  static countDescendants(options: TreeOptions): Observable<number> {
    return queries.countDescendants(options);
  }

  static findAncestors(options: TreeOptions): Observable<TreeNode[]> {
    return queries.findAncestors(options);
  }

  static countAncestors(options: TreeOptions): Observable<number> {
    return queries.countAncestors(options);
  }
}

class UnregisteredTreeNode {
  declare static [ENTITY_STATIC_TYPES]: TreeStaticTypes;
  readonly createdAt = new Date(0);
  readonly id = 1;
  readonly parentId: number | null = null;
  readonly updatedAt = new Date(0);
  static find = vi.fn(() => of([]));
}

const scopes: EffectScope[] = [];
const apps: App[] = [];
const hosts: HTMLElement[] = [];
const node = new TreeNode(1);
const initialOptions = (): TreeOptions => ({ entityId: 1, where: { name: 'first' } });

const inScope = <T>(factory: () => T): { scope: EffectScope; resource: T } => {
  const scope = effectScope();
  scopes.push(scope);
  const resource = scope.run(factory);
  if (resource === undefined) throw new Error('scope 必须返回资源');
  return { scope, resource };
};

const channel = <T>() => {
  const source = new Subject<T>();
  const disposed = vi.fn();
  const stream = new Observable<T>(subscriber => {
    const subscription = source.subscribe(subscriber);
    return () => {
      subscription.unsubscribe();
      disposed();
    };
  });
  return { source, disposed, stream };
};

const inputKinds = ['ref', 'readonly', 'computed', 'getter', 'reactive'] as const;

const input = (kind: (typeof inputKinds)[number]) => {
  const state = ref(initialOptions());
  const direct = reactive(initialOptions());
  const sources: Record<(typeof inputKinds)[number], UseOptions<TreeOptions>> = {
    ref: state,
    readonly: readonly(state),
    computed: computed(() => state.value),
    getter: () => state.value,
    reactive: direct
  };
  return {
    options: sources[kind],
    deepChange: () => {
      state.value.where.name = 'changed';
      direct.where.name = 'changed';
    },
    replace: (options: TreeOptions) => {
      state.value = options;
      Object.assign(direct, options);
    }
  };
};

beforeEach(() => {
  vi.resetAllMocks();
  queries.findDescendants.mockReturnValue(of([node]));
  queries.countDescendants.mockReturnValue(of(3));
  queries.findAncestors.mockReturnValue(of([node]));
  queries.countAncestors.mockReturnValue(of(2));
});

afterEach(() => {
  apps.splice(0).forEach(app => app.unmount());
  scopes.splice(0).forEach(scope => scope.stop());
  hosts.splice(0).forEach(host => host.remove());
  vi.restoreAllMocks();
});

const hookContract = <T>(
  name: string,
  create: (options: UseOptions<TreeOptions>) => RxDBResource<T>,
  query: Mock<(options: TreeOptions) => Observable<T>>,
  sample: T,
  empty: T
) => {
  describe(name, () => {
    it.each(inputKinds)('%s 深改、替换、同值去重与旧流释放', async kind => {
      const first = channel<T>();
      const second = channel<T>();
      const third = channel<T>();
      query.mockReturnValueOnce(first.stream).mockReturnValueOnce(second.stream).mockReturnValueOnce(third.stream);
      const options = input(kind);
      const { resource } = inScope(() => create(options.options));
      expect(resource).toMatchObject({ value: empty, isLoading: true, hasValue: false, isEmpty: undefined });
      first.source.next(sample);
      expect(resource).toMatchObject({ value: sample, isLoading: false, hasValue: true, error: undefined });
      options.deepChange();
      await nextTick();
      expect(query).toHaveBeenCalledTimes(2);
      expect(query).toHaveBeenLastCalledWith({ entityId: 1, where: { name: 'changed' } });
      expect(first.disposed).toHaveBeenCalledOnce();
      expect(resource).toMatchObject({ value: sample, isLoading: true, hasValue: false, isEmpty: undefined });
      second.source.next(empty);
      expect(resource).toMatchObject({ value: empty, isLoading: false, hasValue: true, isEmpty: Array.isArray(empty) });
      options.replace({ entityId: 1, where: { name: 'changed' } });
      await nextTick();
      expect(query).toHaveBeenCalledTimes(2);
      options.replace({ entityId: 'second', where: { name: 'changed' } });
      options.replace({ entityId: 2, where: { name: 'changed' } });
      await nextTick();
      expect(query).toHaveBeenCalledTimes(3);
      expect(query).toHaveBeenLastCalledWith({ entityId: 2, where: { name: 'changed' } });
      expect(second.disposed).toHaveBeenCalledOnce();
      first.source.next(sample);
      second.source.error(new Error('旧代次错误'));
      expect(resource).toMatchObject({ value: empty, isLoading: true, hasValue: false, error: undefined });
      third.source.next(sample);
      expect(resource).toMatchObject({ value: sample, isLoading: false, hasValue: true, error: undefined });
    });

    it('错误透明，重查清错，无 next 完成不伪造值', async () => {
      const failed = channel<T>();
      const completed = channel<T>();
      query.mockReturnValueOnce(failed.stream).mockReturnValueOnce(completed.stream);
      const options = ref(initialOptions());
      const { resource } = inScope(() => create(options));
      const error = new Error('树查询错误');
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      failed.source.error(error);
      expect(resource.error).toBe(error);
      expect(resource).toMatchObject({ isLoading: false, hasValue: false, isEmpty: undefined });
      options.value = { entityId: 2, where: { name: 'second' } };
      await nextTick();
      expect(resource).toMatchObject({ error: undefined, isLoading: true, hasValue: false });
      completed.source.complete();
      expect(resource).toMatchObject({ value: empty, isLoading: false, hasValue: false, isEmpty: undefined });
    });

    it('真实多 scope 独立销毁，停止后晚到值不污染资源', () => {
      const first = channel<T>();
      const second = channel<T>();
      query.mockReturnValueOnce(first.stream).mockReturnValueOnce(second.stream);
      const a = inScope(() => create(initialOptions()));
      const b = inScope(() => create({ entityId: 2, where: { name: 'second' } }));
      first.source.next(sample);
      a.scope.stop();
      expect(first.disposed).toHaveBeenCalledOnce();
      expect(second.disposed).not.toHaveBeenCalled();
      first.source.next(empty);
      expect(a.resource.value).toEqual(sample);
      second.source.next(sample);
      expect(b.resource.value).toEqual(sample);
      b.scope.stop();
      expect(second.disposed).toHaveBeenCalledOnce();
    });
  });
};

hookContract('findDescendants', options => useFindDescendants(TreeNode, options), queries.findDescendants, [node], []);
hookContract('countDescendants', options => useCountDescendants(TreeNode, options), queries.countDescendants, 7, 0);
hookContract('findAncestors', options => useFindAncestors(TreeNode, options), queries.findAncestors, [node], []);
hookContract('countAncestors', options => useCountAncestors(TreeNode, options), queries.countAncestors, 5, 0);

it('四 hooks 在仓储方法缺失时明示错误，不回退到 find', async () => {
  const resources = inScope(() => [
    useFindDescendants(UnregisteredTreeNode, initialOptions()),
    useCountDescendants(UnregisteredTreeNode, initialOptions()),
    useFindAncestors(UnregisteredTreeNode, initialOptions()),
    useCountAncestors(UnregisteredTreeNode, initialOptions())
  ]).resource;
  await Promise.resolve();
  expect(resources.map(resource => resource.error?.message)).toEqual([
    'Method "findDescendants" not found on EntityType',
    'Method "countDescendants" not found on EntityType',
    'Method "findAncestors" not found on EntityType',
    'Method "countAncestors" not found on EntityType'
  ]);
  expect(UnregisteredTreeNode.find).not.toHaveBeenCalled();
  expect(resources.every(resource => !resource.hasValue && !resource.isLoading)).toBe(true);
});

it('真实组件 props 深改/替换与卸载释放四 hooks，实体保持原身份', async () => {
  const descendants = channel<TreeNode[]>();
  const descendantCount = channel<number>();
  const ancestors = channel<TreeNode[]>();
  const ancestorCount = channel<number>();
  queries.findDescendants.mockReturnValue(descendants.stream);
  queries.countDescendants.mockReturnValue(descendantCount.stream);
  queries.findAncestors.mockReturnValue(ancestors.stream);
  queries.countAncestors.mockReturnValue(ancestorCount.stream);
  const rootOptions = ref(initialOptions());
  const resources: RxDBResource<TreeNode[]>[] = [];
  const counts: RxDBResource<number>[] = [];
  const Consumer = defineComponent({
    props: { options: { type: Object as PropType<TreeOptions>, required: true } },
    setup(props) {
      const options = () => props.options;
      resources.push(useFindDescendants(TreeNode, options), useFindAncestors(TreeNode, options));
      counts.push(useCountDescendants(TreeNode, options), useCountAncestors(TreeNode, options));
      return () => h('output', String(counts[0]?.value));
    }
  });
  const app = createApp({ render: () => h(Consumer, { options: rootOptions.value }) });
  const host = document.createElement('div');
  hosts.push(host);
  document.body.appendChild(host);
  apps.push(app);
  app.mount(host);
  descendants.source.next([node]);
  ancestors.source.next([node]);
  descendantCount.source.next(7);
  ancestorCount.source.next(5);
  await nextTick();
  expect(resources.map(resource => resource.value[0])).toEqual([node, node]);
  expect(resources[0]?.value[0]).toBe(node);
  expect(isProxy(resources[0]?.value[0])).toBe(false);
  expect(host.textContent).toBe('7');
  rootOptions.value.where.name = 'deep-change';
  await nextTick();
  expect(queries.findDescendants).toHaveBeenLastCalledWith({ entityId: 1, where: { name: 'deep-change' } });
  rootOptions.value = { entityId: 2, where: { name: 'replacement' } };
  await nextTick();
  expect(Object.values(queries).every(query => query.mock.calls.length === 3)).toBe(true);
  expect(Object.values(queries).every(query => query.mock.lastCall?.[0].entityId === 2)).toBe(true);
  expect(counts.every(resource => !resource.hasValue && resource.isLoading)).toBe(true);
  apps.splice(0).forEach(mounted => mounted.unmount());
  expect(
    [descendants, descendantCount, ancestors, ancestorCount].every(source => source.disposed.mock.calls.length === 3)
  ).toBe(true);
  descendants.source.next([]);
  descendantCount.source.next(99);
  ancestors.source.next([]);
  ancestorCount.source.next(99);
  expect(resources[0]?.value[0]).toBe(node);
  expect(counts.map(resource => resource.value)).toEqual([7, 5]);
  expect(host.textContent).toBe('');
});
