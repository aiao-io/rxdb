# rxdb-plugin-working-tree-react 深度评审

- 包：`@aiao/rxdb-plugin-working-tree-react`
- 日期：2026-10-29
- 基线：`f62f77c19d55c73d8335df026778422282c2fed4`
- 结论：🟢好。本次已审范围未发现新增确定缺陷；不代表全部路径无缺陷。
- 2026-10-29 复核：源码自基线起无变更（git diff 7bb16a9..HEAD 本包为空）；抽查关键符号与报告链接均有效，结论与计数不变。

## 评审计划与实际范围

比对本组三端实际 src/index.ts；检查 useWorkingTree/useWorktrees 的 database 身份槽、render 复位、拒绝旧库迟到 patch、命令 memo，以及 useSyncExternalStore 的 mounted 快照/退订。

## 核查结果

- [`useWorkingTree`](../../../packages/rxdb-plugin-working-tree-react/src/use-working-tree.ts) 与 [`useWorktrees`](../../../packages/rxdb-plugin-working-tree-react/src/use-worktrees.ts)：状态槽带 database 身份，换Provider时在render重置；patch用函数式更新拒绝旧库迟到结果。mounted通过useSyncExternalStore订阅并返回退订函数。
- 工作树十四格与检出位十格沿用核心状态类型及同名命令；恢复拒绝是返回值，不被包装成空状态。
- 三端 index.ts 的 `useWorkingTree/WorkingTreeResource/useWorktrees/WorktreesResource` 导出集合相同；核心错误类型按共同约定从 peer 包读取。
- 方法只在命令发起时调用数据库；创建入口没有额外 I/O。并发同格 latest-only 由核心共用命令层负责。

- [`createLatestOnlyPatch`](../../../packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts) 只抑制旧状态回写，不取消数据库操作本身；框架卸载不等于用户发起的持久化命令应回滚。检出位 mounted 订阅和命令 Promise 的所有权分别检查。

## 问题

本次未发现可给出确定触发链的新增包内问题。

**2026-10-29 复核：**本包源码自基线起无变更；抽查关键符号与链接仍有效，结论不变，本更新轮未发现新的确定问题。

## 验证证据与边界

- 静态证据：逐一读取上述符号的实现，并沿对应调用链核对；未修改产品代码或既有测试。
- 发现仓库测试文件 5 份；文件数仅描述现有测试入口，不等于本次覆盖率。
- 首轮（2026-10-28）`rxdb-plugin-working-tree-react:test`：67 passed (67)；目标实际执行。命令及整体边界见[总索引](README.md)。
- Angular/Vue 的入口绑定创建时数据库，换库要求重建组件是当前源码公开约定；React 自动跟随 Provider 换库。工作树状态不自动跟随外部写更新也已文档化，本次不报成漏订阅。未做六后端框架组合验收。
