/**
 * 树 hooks 的 React 绑定契约。
 *
 * @remarks
 * 这四条用例原先住在 `packages/rxdb-react/src/__tests__/hooks.spec.ts` 的「dispatches every
 * public hook」里。树能力随 US-025 阶段 E 搬到 `@aiao/rxdb-plugin-tree` 之后，断言也必须跟着走：
 * 留在 `rxdb-react` 等于让核心绑定包的测试替一个它不再依赖的插件背书。
 *
 * 对应文件（同名同结构，三端逐条对齐）：
 * - `packages/rxdb-plugin-tree-angular/src/__tests__/use-tree.spec.ts`
 * - `packages/rxdb-plugin-tree-vue/src/__tests__/use-tree.spec.ts`
 */
import { ENTITY_STATIC_TYPES } from '@aiao/rxdb';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { Observable, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

beforeEach(() => {
  vi.resetAllMocks();
  queryMocks.findDescendants.mockReturnValue(of([new TreeEntity('descendant')]));
  queryMocks.countDescendants.mockReturnValue(of(2));
  queryMocks.findAncestors.mockReturnValue(of([new TreeEntity('ancestor')]));
  queryMocks.countAncestors.mockReturnValue(of(1));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('树 hooks（React）', () => {
  it('四个 hook 各自派发到同名仓储方法', async () => {
    const options: TreeOptions = { entityId: 'root' };
    const resources = [
      renderHook(() => useFindDescendants(TreeEntity, options)),
      renderHook(() => useCountDescendants(TreeEntity, options)),
      renderHook(() => useFindAncestors(TreeEntity, options)),
      renderHook(() => useCountAncestors(TreeEntity, options))
    ];

    await waitFor(() => expect(resources.every(resource => resource.result.current.hasValue)).toBe(true));

    expect(queryMocks.findDescendants).toHaveBeenCalledWith(options);
    expect(queryMocks.countDescendants).toHaveBeenCalledWith(options);
    expect(queryMocks.findAncestors).toHaveBeenCalledWith(options);
    expect(queryMocks.countAncestors).toHaveBeenCalledWith(options);
  });

  it('查询结果原样透出，计数 hook 的初值是 0 而不是 undefined', async () => {
    const descendants = renderHook(() => useFindDescendants(TreeEntity, { entityId: 'root' }));
    const count = renderHook(() => useCountAncestors(TreeEntity, { entityId: 'leaf' }));

    expect(count.result.current.value).toBe(0);

    await waitFor(() => expect(descendants.result.current.hasValue).toBe(true));
    await waitFor(() => expect(count.result.current.hasValue).toBe(true));

    expect(descendants.result.current.value.map(node => node.id)).toEqual(['descendant']);
    expect(count.result.current.value).toBe(1);
  });
});
