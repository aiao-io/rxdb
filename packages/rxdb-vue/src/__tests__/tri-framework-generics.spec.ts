/**
 * 三端泛型契约（RAN-014）—— Vue 侧。
 *
 * @remarks
 * 断言全部在**编译期**成立：`@ts-expect-error` 由 `nx typecheck rxdb-vue` 校验 ——
 * 指令下的那行若不再报错，tsc 会以 TS2578「Unused '@ts-expect-error' directive」失败。
 * 运行时的 `expect` 只是让用例非空，不承担类型校验。
 *
 * 对应文件（同名同结构，三端逐条对齐）：
 * - `packages/rxdb-angular/src/__tests__/tri-framework-generics.spec.ts`
 * - `packages/rxdb-react/src/__tests__/tri-framework-generics.spec.ts`
 */
import { ENTITY_STATIC_TYPES, type EntityStaticType } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import type { ComputedRef, Ref } from 'vue';
import {
  useCountAncestors,
  useCountDescendants,
  useCountNeighbors,
  useFindAncestors,
  useFindDescendants,
  useGraphNeighbors,
  useGraphPaths
} from '../hooks';
import type { GraphPath, GraphQueryResult, NeighborResult, RxDBResource } from '../index';
import type { InfiniteScrollResource } from '../useInfiniteScroll';

interface TreeGraphStaticTypes {
  findTreeOptions: { entityId: string };
  findNeighborsOptions: { entityId: string };
  findPathsOptions: { fromId: string; toId: string };
}

const treeGraphStaticTypes: TreeGraphStaticTypes = {
  findTreeOptions: { entityId: '' },
  findNeighborsOptions: { entityId: '' },
  findPathsOptions: { fromId: '', toId: '' }
};

/**
 * 满足 `EntityType`，但实例缺 `createdAt` / `updatedAt` ——
 * 因此既不是 `ITreeEntity` 也不是 `IGraphEntity`。
 */
class PlainEntity {
  static [ENTITY_STATIC_TYPES]: TreeGraphStaticTypes = treeGraphStaticTypes;
  id = 'plain';
}

/** 完整实现 `IEntity`，可用于树/图 hooks。 */
class TreeGraphEntity {
  static [ENTITY_STATIC_TYPES]: TreeGraphStaticTypes = treeGraphStaticTypes;
  createdAt = new Date(0);
  id = 'node';
  parentId: string | null = null;
  updatedAt = new Date(0);
}

/** 声明了自定义 `findByCursorOptions` 的实体：通用形状不该再被接受。 */
interface DeclaredCursorOptions {
  bucket: string;
  limit?: number;
}

class DeclaredCursorEntity {
  static [ENTITY_STATIC_TYPES]: { findByCursorOptions: DeclaredCursorOptions } = {
    findByCursorOptions: { bucket: '' }
  };
  createdAt = new Date(0);
  id = 'declared';
  updatedAt = new Date(0);
}

type CursorOptionsOf<T extends { [ENTITY_STATIC_TYPES]?: object } & (new (...args: never[]) => object)> =
  EntityStaticType<T, 'findByCursorOptions'>;

describe('三端泛型契约（RAN-014）', () => {
  describe('树 hooks 只接受树实体', () => {
    it('非树实体被编译期拒绝', () => {
      // 函数体永不执行：类型断言已由 @ts-expect-error 在编译期完成
      const useMisuse = (): void => {
        // @ts-expect-error PlainEntity 实例缺 createdAt/updatedAt，不满足 ITreeEntity
        useFindDescendants(PlainEntity, { entityId: 'root' });
        // @ts-expect-error PlainEntity 不满足 ITreeEntity，countDescendants 同样拒绝
        useCountDescendants(PlainEntity, { entityId: 'root' });
        // @ts-expect-error PlainEntity 不满足 ITreeEntity，findAncestors 同样拒绝
        useFindAncestors(PlainEntity, { entityId: 'leaf' });
        // @ts-expect-error PlainEntity 不满足 ITreeEntity，countAncestors 同样拒绝
        useCountAncestors(PlainEntity, { entityId: 'leaf' });
      };

      expect(useMisuse).toBeTypeOf('function');
    });

    it('树实体被接受', () => {
      const useUsage = (): void => {
        useFindDescendants(TreeGraphEntity, { entityId: 'root' });
        useCountAncestors(TreeGraphEntity, { entityId: 'leaf' });
      };

      expect(useUsage).toBeTypeOf('function');
    });
  });

  describe('图 hooks 只接受图实体', () => {
    it('非图实体被编译期拒绝', () => {
      const useMisuse = (): void => {
        // @ts-expect-error PlainEntity 实例缺 createdAt/updatedAt，不满足 IGraphEntity
        useGraphNeighbors(PlainEntity, { entityId: 'a' });
        // @ts-expect-error PlainEntity 不满足 IGraphEntity，countNeighbors 同样拒绝
        useCountNeighbors(PlainEntity, { entityId: 'a' });
        // @ts-expect-error PlainEntity 不满足 IGraphEntity，graphPaths 同样拒绝
        useGraphPaths(PlainEntity, { fromId: 'a', toId: 'b' });
      };

      expect(useMisuse).toBeTypeOf('function');
    });

    it('图实体被接受', () => {
      const useUsage = (): void => {
        const neighbors: RxDBResource<GraphQueryResult<NeighborResult<typeof TreeGraphEntity>>> = useGraphNeighbors(
          TreeGraphEntity,
          { entityId: 'a' }
        );
        const paths: RxDBResource<GraphQueryResult<GraphPath<typeof TreeGraphEntity>>> = useGraphPaths(
          TreeGraphEntity,
          { fromId: 'a', toId: 'b' }
        );

        void neighbors;
        void paths;
      };

      expect(useUsage).toBeTypeOf('function');
    });
  });

  describe('无限滚动选项遵循实体声明的 findByCursorOptions', () => {
    it('通用 FindByCursorOptions 形状被编译期拒绝', () => {
      const options: CursorOptionsOf<typeof DeclaredCursorEntity> =
        // @ts-expect-error 实体声明的 findByCursorOptions 要求 bucket，通用 where/orderBy 形状不再适用
        { where: { combinator: 'and', rules: [] }, orderBy: [{ field: 'id', sort: 'asc' }] };

      expect(options).toBeTypeOf('object');
    });

    it('实体声明的形状被接受', () => {
      const options: CursorOptionsOf<typeof DeclaredCursorEntity> = { bucket: 'inbox', limit: 10 };

      // 值位置用一次：类只在类型位置出现会被 no-unused-vars 判为未使用
      expect(new DeclaredCursorEntity().id).toBe('declared');
      expect(options).toEqual({ bucket: 'inbox', limit: 10 });
    });
  });

  describe('无限滚动状态对外只读', () => {
    it('isLoading / error / hasMore 不可写', () => {
      const misuse = (resource: InfiniteScrollResource<TreeGraphEntity>): void => {
        // @ts-expect-error 状态机只能经 loadMore/refresh 改变（RAN-009 / RAN-014）
        resource.isLoading.value = false;
        // @ts-expect-error error 同为只读投影，不接受外部写入
        resource.error.value = undefined;
        // @ts-expect-error hasMore 同为只读投影，不接受外部写入
        resource.hasMore.value = true;
      };

      expect(misuse).toBeTypeOf('function');
    });

    it('声明为 ComputedRef 而不是可写 ref()', () => {
      const assertReadonly = (resource: InfiniteScrollResource<TreeGraphEntity>): void => {
        const isLoading: ComputedRef<boolean> = resource.isLoading;
        const error: ComputedRef<Error | undefined> = resource.error;
        const hasMore: ComputedRef<boolean> = resource.hasMore;

        expect([isLoading, error, hasMore]).toHaveLength(3);
      };

      // 反向：可写 ref() 不满足 ComputedRef（缺 effect / [ComputedRefSymbol]），
      // 因此这三个字段不可能是内部 ref 的直接透出。
      // 注意 ComputedRef → Ref 在 Vue 类型里是成立的（`readonly value` 不影响可赋值性），
      // 所以只能反向断言，正向 `const w: Ref<boolean> = resource.isLoading` 不构成错误。
      const notWritable = (writable: Ref<boolean>): void => {
        // @ts-expect-error 可写 ref 缺 ComputedRef 的成员，无法冒充只读投影
        const asComputed: ComputedRef<boolean> = writable;

        expect(asComputed).toBeDefined();
      };

      expect(assertReadonly).toBeTypeOf('function');
      expect(notWritable).toBeTypeOf('function');
    });
  });
});
