/**
 * 树 hooks 的 Angular 绑定契约。
 *
 * @remarks
 * 这四条用例原先住在 `packages/rxdb-angular/src/__tests__/hooks.spec.ts` 的四个
 * `describe('useFindDescendants' …)` 里。树能力随 US-025 阶段 E 搬到
 * `@aiao/rxdb-plugin-tree` 之后，断言也必须跟着走：留在 `rxdb-angular` 等于让核心绑定包
 * 的测试替一个它不再依赖的插件背书。
 *
 * 对应文件（同名同结构，三端逐条对齐）：
 * - `packages/rxdb-plugin-tree-react/src/__tests__/use-tree.spec.ts`
 * - `packages/rxdb-plugin-tree-vue/src/__tests__/use-tree.spec.ts`
 */
import { ENTITY_STATIC_TYPES, type UUID } from '@aiao/rxdb';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCountAncestors, useCountDescendants, useFindAncestors, useFindDescendants } from '../index.js';

interface TreeOptions {
  entityId: string;
}

/** 满足 `ITreeEntity`：`id` / `createdAt` / `updatedAt` / `parentId` 齐备。 */
class MockTreeEntity {
  static [ENTITY_STATIC_TYPES]: { findTreeOptions: TreeOptions } = { findTreeOptions: { entityId: '' } };

  static findDescendants = vi.fn();
  static countDescendants = vi.fn();
  static findAncestors = vi.fn();
  static countAncestors = vi.fn();

  createdAt = new Date(0);
  id: UUID = '00000000-0000-0000-0000-000000000000';
  parentId: UUID | null = null;
  updatedAt = new Date(0);
}

const TreeEntity = MockTreeEntity;

describe('树 hooks（Angular）', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    vi.clearAllMocks();
  });

  it('useFindDescendants 派发到 findDescendants', () => {
    MockTreeEntity.findDescendants.mockReturnValue(new BehaviorSubject([{ id: '1', name: 'Child' }]).asObservable());

    TestBed.runInInjectionContext(() => {
      const resource = useFindDescendants(TreeEntity, { entityId: 'parent-1' });

      resource.value();
      TestBed.flushEffects();

      expect(MockTreeEntity.findDescendants).toHaveBeenCalledWith({ entityId: 'parent-1' });
    });
  });

  it('useCountDescendants 派发到 countDescendants', () => {
    MockTreeEntity.countDescendants.mockReturnValue(new BehaviorSubject(3).asObservable());

    TestBed.runInInjectionContext(() => {
      const resource = useCountDescendants(TreeEntity, { entityId: 'parent-1' });

      resource.value();
      TestBed.flushEffects();

      expect(MockTreeEntity.countDescendants).toHaveBeenCalledWith({ entityId: 'parent-1' });
    });
  });

  it('useFindAncestors 派发到 findAncestors', () => {
    MockTreeEntity.findAncestors.mockReturnValue(new BehaviorSubject([{ id: '1', name: 'Parent' }]).asObservable());

    TestBed.runInInjectionContext(() => {
      const resource = useFindAncestors(TreeEntity, { entityId: 'child-1' });

      resource.value();
      TestBed.flushEffects();

      expect(MockTreeEntity.findAncestors).toHaveBeenCalledWith({ entityId: 'child-1' });
    });
  });

  it('useCountAncestors 派发到 countAncestors', () => {
    MockTreeEntity.countAncestors.mockReturnValue(new BehaviorSubject(2).asObservable());

    TestBed.runInInjectionContext(() => {
      const resource = useCountAncestors(TreeEntity, { entityId: 'child-1' });

      resource.value();
      TestBed.flushEffects();

      expect(MockTreeEntity.countAncestors).toHaveBeenCalledWith({ entityId: 'child-1' });
    });
  });
});
