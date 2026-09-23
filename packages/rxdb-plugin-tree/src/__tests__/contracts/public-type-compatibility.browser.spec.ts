import { describe, expectTypeOf, it } from 'vitest';
// 从**包根**导入，而不是相对路径 —— 这一组断言检验的正是「用户能不能具名」，
// 绕过 index.ts 去读源文件就把要测的东西测没了。
import type { FindTreeOptions, ITreeEntity, ITreeRepository, TreeRepository } from '../../index.js';

/** `TreeRepository` 的泛型约束要求实体产出 {@link ITreeEntity}，替身必须是树形。 */
class ProxiedEntity implements ITreeEntity {
  id!: string;
  createdAt!: Date;
  updatedAt!: Date;
  parentId?: string | null;
  hasChildren?: boolean | null;
}

describe('@aiao/rxdb-plugin-tree 的公开类型必须可具名', () => {
  it('exposes every type reachable from a public signature', () => {
    // 这三个都出现在用户拿得到的签名上：`ITreeRepository` 是 `getRepository(E)` 在
    // `@TreeEntity` 上的返回面，`FindTreeOptions` 是它四个树查询的形参，
    // `TreeRepository` 是六个适配器 `case 'TreeRepository'` 背后被实例化的那个类。
    // 没进桶的后果是：用户接得到值、写不出类型，只能退回 `any` 或者自己抄一份结构。
    //
    // 断言写成「不是 never」而不是逐个比结构：这里要钉的是**可具名性**，
    // 类型自身的形状由各自模块的测试负责。类型没导出时 `import type` 直接编译失败，
    // 这个 it 连带整个文件一起红 —— 这就是它的红态。
    //
    // 这份文件的搬家史：核心
    // （`packages/rxdb/src/__tests__/contracts/public-type-compatibility.spec.ts`，
    // 现只留一条指路注释）→ 本包（US-025 阶段 E）。判据始终跟着实现走。
    expectTypeOf<ITreeRepository<typeof ProxiedEntity>>().not.toBeNever();
    expectTypeOf<FindTreeOptions<typeof ProxiedEntity>>().not.toBeNever();
    expectTypeOf<TreeRepository<typeof ProxiedEntity>>().not.toBeNever();
  });
});
