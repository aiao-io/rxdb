import { describe, expectTypeOf, it } from 'vitest';
// 从**包根**导入，而不是相对路径 —— 这一组断言检验的正是「用户能不能具名」，
// 绕过 index.ts 去读源文件就把要测的东西测没了。
import type {
  BulkSyncOptions,
  BulkSyncResult,
  DependencyGraph,
  RepositorySyncStatus,
  VersionManager
} from '../../index.js';

describe('@aiao/rxdb-plugin-history 的公开类型必须可具名', () => {
  it('exposes every type reachable from a public signature', () => {
    // 这五个都出现在用户拿得到的签名上（`RxDB.versionManager` 由本包经 `declare module`
    // 挂上去，它的方法签名再引用其余四个），所以它们必须进本包 index.ts 的桶。
    // 后果否则是：用户接得到值、写不出类型，只能退回 `any` 或者自己抄一份结构。
    //
    // 断言写成「不是 never」而不是逐个比结构：这里要钉的是**可具名性**，
    // 类型自身的形状由各自模块的测试负责。类型没导出时 `import type` 直接编译失败，
    // 这个 it 连带整个文件一起红 —— 这就是它的红态。
    //
    // US-025 阶段 C 之前这一组由核心的
    // `packages/rxdb/src/__tests__/contracts/public-type-compatibility.spec.ts` 守；
    // 实现搬进本包之后判据跟着实现走，核心那份只留一条指路注释。
    expectTypeOf<BulkSyncOptions>().not.toBeNever();
    expectTypeOf<BulkSyncResult>().not.toBeNever();
    expectTypeOf<RepositorySyncStatus>().not.toBeNever();
    expectTypeOf<DependencyGraph>().not.toBeNever();
    expectTypeOf<VersionManager>().not.toBeNever();
  });
});
