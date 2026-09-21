/**
 * 树 hooks 的 Vue 绑定契约。
 *
 * @remarks
 * 这几条断言原先住在 `packages/rxdb-vue/src/__tests__/hooks.spec.ts` 的
 * 「delegates every public query wrapper」里。树能力随 US-025 阶段 E 搬到
 * `@aiao/rxdb-plugin-tree` 之后，断言也必须跟着走：留在 `rxdb-vue` 等于让核心绑定包
 * 的测试替一个它不再依赖的插件背书。
 *
 * 对应文件（同名同结构，三端逐条对齐）：
 * - `packages/rxdb-plugin-tree-angular/src/__tests__/use-tree.spec.ts`
 * - `packages/rxdb-plugin-tree-react/src/__tests__/use-tree.spec.ts`
 */
import { ENTITY_STATIC_TYPES } from '@aiao/rxdb';
import { Observable, of, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, type EffectScope } from 'vue';

import { useCountAncestors, useCountDescendants, useFindAncestors, useFindDescendants } from '../index.js';

interface TreeOptions {
  entityId: string;
}

const queryMocks = {
  findDescendants: vi.fn<(options: TreeOptions) => Observable<TreeEntity[]>>(),
  countDescendants: vi.fn<(options: TreeOptions) => Observable<number>>(),
  findAncestors: vi.fn<(options: TreeOptions) => Observable<TreeEntity[]>>(),
  countAncestors: vi.fn<(options: TreeOptions) => Observable<number>>()
};

/** 满足 `ITreeEntity`：`id` / `createdAt` / `updatedAt` / `parentId` 齐备。 */
class TreeEntity {
  static [ENTITY_STATIC_TYPES]: { findTreeOptions: TreeOptions } = { findTreeOptions: { entityId: '' } };

  readonly createdAt = new Date(0);
  readonly parentId: string | null = null;
  readonly updatedAt = new Date(0);

  constructor(readonly id = 'node') {}

  static findDescendants(options: TreeOptions): Observable<TreeEntity[]> {
    return queryMocks.findDescendants(options);
  }

  static countDescendants(options: TreeOptions): Observable<number> {
    return queryMocks.countDescendants(options);
  }

  static findAncestors(options: TreeOptions): Observable<TreeEntity[]> {
    return queryMocks.findAncestors(options);
  }

  static countAncestors(options: TreeOptions): Observable<number> {
    return queryMocks.countAncestors(options);
  }
}

const activeScopes: EffectScope[] = [];

const inScope = <T>(factory: () => T): T => {
  const scope = effectScope();
  activeScopes.push(scope);
  const result = scope.run(factory);
  if (result === undefined) {
    throw new Error('Effect scope did not return a resource');
  }
  return result;
};

beforeEach(() => {
  vi.resetAllMocks();
  queryMocks.findDescendants.mockReturnValue(of([new TreeEntity('descendant')]));
  queryMocks.countDescendants.mockReturnValue(of(2));
  queryMocks.findAncestors.mockReturnValue(of([new TreeEntity('ancestor')]));
  queryMocks.countAncestors.mockReturnValue(of(1));
});

afterEach(() => {
  while (activeScopes.length > 0) {
    activeScopes.pop()?.stop();
  }
  vi.restoreAllMocks();
});

describe('树 hooks（Vue）', () => {
  it('四个 hook 各自派发到同名仓储方法', () => {
    const resources = inScope(() => ({
      descendants: useFindDescendants(TreeEntity, { entityId: 'descendants' }),
      descendantCount: useCountDescendants(TreeEntity, { entityId: 'descendant-count' }),
      ancestors: useFindAncestors(TreeEntity, { entityId: 'ancestors' }),
      ancestorCount: useCountAncestors(TreeEntity, { entityId: 'ancestor-count' })
    }));

    expect(resources.descendants.value[0]?.id).toBe('descendant');
    expect(resources.descendantCount.value).toBe(2);
    expect(resources.ancestors.value[0]?.id).toBe('ancestor');
    expect(resources.ancestorCount.value).toBe(1);

    expect(queryMocks.findDescendants).toHaveBeenCalledWith({ entityId: 'descendants' });
    expect(queryMocks.countDescendants).toHaveBeenCalledWith({ entityId: 'descendant-count' });
    expect(queryMocks.findAncestors).toHaveBeenCalledWith({ entityId: 'ancestors' });
    expect(queryMocks.countAncestors).toHaveBeenCalledWith({ entityId: 'ancestor-count' });
  });

  it('计数 hook 未产出前的默认值是 0 而不是 undefined', () => {
    // 用永不自发产出的 Subject：`of(...)` 在建资源时就同步产出了，测不到默认值这一刻。
    const pending = new Subject<number>();
    queryMocks.countDescendants.mockReturnValue(pending);

    const count = inScope(() => useCountDescendants(TreeEntity, { entityId: 'leaf' }));

    expect(count).toMatchObject({ value: 0, error: undefined, isLoading: true, hasValue: false });

    pending.next(7);

    expect(count).toMatchObject({ value: 7, error: undefined, isLoading: false, hasValue: true });
  });
});
