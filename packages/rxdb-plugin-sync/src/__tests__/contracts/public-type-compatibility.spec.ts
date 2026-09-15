import { describe, expectTypeOf, it } from 'vitest';
// 从**包根**导入，而不是相对路径 —— 这一组断言检验的正是「用户能不能具名」，
// 绕过 index.ts 去读源文件就把要测的东西测没了。
import type {
  BulkSyncOptions,
  BulkSyncResult,
  CheckRepositoryUpdatesResult,
  DependencyGraph,
  GetAllRepositorySyncStatusFilter,
  RepositorySyncStatus,
  SyncManager
} from '../../index.js';

describe('@aiao/rxdb-plugin-sync 的公开类型必须可具名', () => {
  it('exposes every type reachable from a public signature', () => {
    // 这七个都出现在用户拿得到的签名上（`RxDB.syncManager` 由本包经 `declare module`
    // 挂上去，它的方法签名再引用其余六个），所以它们必须进本包 index.ts 的桶。
    // 后果否则是：用户接得到值、写不出类型，只能退回 `any` 或者自己抄一份结构。
    //
    // 断言写成「不是 never」而不是逐个比结构：这里要钉的是**可具名性**，
    // 类型自身的形状由 `sync-manager-api.spec.ts` 负责（它从方法签名反推同名类型，
    // 再逐字段比对运行时真正返回的键集合）。类型没导出时 `import type` 直接编译失败，
    // 这个 it 连带整个文件一起红 —— 这就是它的红态。
    //
    // 这一组的搬家史：核心 → 历史插件（US-025 阶段 C）→ 本包（阶段 D）。
    // 判据始终跟着实现走，`VersionManager` 那一条留在历史包。
    //
    // `GetAllRepositorySyncStatusFilter` 是搬家时补上的：它一直在
    // `getAllRepositorySyncStatus(filter?)` 的签名里，却从没进过任何一个桶，
    // 于是想给这个过滤器起个名字的人只能 `Parameters<...>[0]` 反推。
    expectTypeOf<BulkSyncOptions>().not.toBeNever();
    expectTypeOf<BulkSyncResult>().not.toBeNever();
    expectTypeOf<CheckRepositoryUpdatesResult>().not.toBeNever();
    expectTypeOf<DependencyGraph>().not.toBeNever();
    expectTypeOf<GetAllRepositorySyncStatusFilter>().not.toBeNever();
    expectTypeOf<RepositorySyncStatus>().not.toBeNever();
    expectTypeOf<SyncManager>().not.toBeNever();
  });
});
