---
title: Angular / React / Vue 跨框架 API 增量复核
status: IncrementalReview
baseline: ffed57da
incrementalFrom: 18ea576f
reviewed: 2026-10-26
---

# 跨框架 API 增量复核

## 当前结论

按 tri-framework-check 技能读取各组的实际 `src/index.ts`，并对 working-tree 新增接口与模型 EntityList 增量对照。**新增 `useWorktrees`、从提交建分支命令及模型只读/历史屏障入口三端齐全**。旧 search 错误处理与游标重锚问题没有实现修复，继续保留。

| API 组                    | Angular                                                  | React                                          | Vue                 | 本轮结论                                                                                             |
| ------------------------- | -------------------------------------------------------- | ---------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------- |
| working-tree 检出位       | `useWorktrees` / `WorktreesResource`                     | 同名                                           | 同名                | 十格异步状态、十个命令与 `mounted` 齐全；分别包装为 Signal / 渲染快照 / ComputedRef                  |
| working-tree 从提交建分支 | `checkBranchFromCommit` / `createBranchFromCommit`       | 同名                                           | 同名                | 命令、状态与共享结果类型的引用对齐                                                                   |
| working-tree 生命周期     | 注入器销毁退订                                           | Provider 换库复位并隔离旧结果、外部 store 退订 | 作用域销毁退订      | 实现按框架习惯；测试分别 77 / 67 / 68 例通过                                                         |
| model EntityList          | readonly 能力与 editable columns、undo/redo barrier 提示 | 同功能                                         | 同功能              | 增量字段与订阅清理对齐；本轮未跑模型三端全量测试                                                     |
| search                    | `reportStreamFailure` 接 ErrorHandler                    | 四流缺 error 回调                              | 四流缺 error 回调   | 旧 P2 保留，源码无增量；见 React/Vue 逐包报告                                                        |
| cursor 无限滚动           | `InfiniteScrollingList`                                  | `useInfiniteScroll`                            | `useInfiniteScroll` | 旧 P2 保留：只按 id 重锚，排序键变化不重锚；根因与 core `findByCursor` 共计一条                      |
| replay                    | `ReplayerComponent`                                      | `Replayer`                                     | `Replayer`          | 本包三端运行时代码无变化；挂载前 seek 修复不再作为待处理项；rrweb 2.2.0 升级未在本轮执行回放集成验证 |
| tree                      | 四个 Ancestors/Descendants 入口                          | 同左                                           | 同左                | 导出未变化，无新增不对称                                                                             |
| code-editor               | 组件实例方法 + inputs/outputs                            | props/ref                                      | props/emits/expose  | 公开实现无变化；依赖版本变化仅静态核对                                                               |

## 证据与边界

三端 working-tree 的 `src/index.ts` 均导出 `useWorkingTree`、`WorkingTreeResource`、`useWorktrees`、`WorktreesResource`。读取各端 `use-worktrees.ts` 与 `use-working-tree.ts`，核对核心 `WorktreeAsyncStates` / 命令签名与清理路径；没有把 Angular 的 Signal 与 Vue 的 ComputedRef 等包装差异误报成缺 API。

静态导出对齐不等价于所有运行行为对齐：旧 `rxdb-model-react` 的 StrictMode/异步源问题、`rxdb-model-angular` 的空断言问题仍在各自报告。检出位共享核心还有本轮 INC-001，三端包装测试通过不关闭该失败清理缺陷。

实际命令与全部验证范围见 [本轮记录](./incremental-2026-10-26.md#验证)。未跑模型/编辑器/replay 的完整浏览器矩阵、SSR、桌面/小程序宿主与发布包消费。
