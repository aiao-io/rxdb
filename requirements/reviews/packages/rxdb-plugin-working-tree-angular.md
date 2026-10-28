# rxdb-plugin-working-tree-angular 深度评审

- 包：`@aiao/rxdb-plugin-working-tree-angular`
- 日期：2026-10-28
- 基线：`7bb16a9014095d4003bd059244722013b36867c1`
- 结论：🟢好。本次已审范围未发现新增确定缺陷；不代表全部路径无缺陷。

## 评审计划与实际范围

比对本组三端实际 src/index.ts；检查 useWorkingTree 的独立 signal 状态和共用命令接入，useWorktrees 的 requireSync mounted 流及注入上下文释放，确认命令拒绝结果和异常没有被混成空数据。

## 核查结果

- [`useWorkingTree`](../../../packages/rxdb-plugin-working-tree-angular/src/use-working-tree.ts) 与 [`useWorktrees`](../../../packages/rxdb-plugin-working-tree-angular/src/use-worktrees.ts)：useWorkingTree 用每次调用独立 signal，useWorktrees 先验证挂载流同步交付，再由 toSignal(requireSync:true) 接入并归属注入上下文。
- 工作树十四格与检出位十格沿用核心状态类型及同名命令；恢复拒绝是返回值，不被包装成空状态。
- 三端 index.ts 的 `useWorkingTree/WorkingTreeResource/useWorktrees/WorktreesResource` 导出集合相同；核心错误类型按共同约定从 peer 包读取。
- 方法只在命令发起时调用数据库；创建入口没有额外 I/O。并发同格 latest-only 由核心共用命令层负责。

- [`createLatestOnlyPatch`](../../../packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts) 只抑制旧状态回写，不取消数据库操作本身；框架卸载不等于用户发起的持久化命令应回滚。检出位 mounted 订阅和命令 Promise 的所有权分别检查。

## 问题

本次未发现可给出确定触发链的新增包内问题。

## 验证证据与边界

- 静态证据：逐一读取上述符号的实现，并沿对应调用链核对；未修改产品代码或既有测试。
- 发现仓库测试文件 6 份；文件数仅描述现有测试入口，不等于本次覆盖率。
- 本次 `rxdb-plugin-working-tree-angular:test`：77 passed (77)；目标实际执行。命令及整体边界见[总索引](README.md)。
- Angular/Vue 的入口绑定创建时数据库，换库要求重建组件是当前源码公开约定；React 自动跟随 Provider 换库。工作树状态不自动跟随外部写更新也已文档化，本次不报成漏订阅。未做六后端框架组合验收。
