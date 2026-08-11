# `todo` Angular 示例代码评审

## 结论

🔴 不通过。模板、过期断言和滚动订阅已修复，但示例仍被工作区排除，SSR 工厂仍存在类型绕过。

## 修复状态（2026-07-15）

- EXAMPLE-TODO-001、EXAMPLE-TODO-002、EXAMPLE-TODO-005 已修复。
- EXAMPLE-TODO-003 未修复；EXAMPLE-TODO-004 仅清理页面中的 `any`，SSR 工厂仍需重新建模。

## 评审基线

- 基线提交：`03a46a5d5992a958c19ae33d5fed15c9c3322021`
- 评审日期：2026-07-14
- 范围：`examples/angular-todo` 下 Angular 应用源码、单元测试、构建配置及其工作区接入状态
- 自动校验：本轮仅执行静态只读审查；该示例被 pnpm 工作区排除，未单独安装依赖或运行 `test`/`build`
- 测试现状：仅有基础 App spec，现有标题断言与页面实现不一致；无 Todo 交互与生命周期测试

## 问题

| ID | 级别 | 位置 | 问题与影响 | 建议 |
| --- | --- | --- | --- | --- |
| EXAMPLE-TODO-001 | P1 | `src/app/todo/todo.page.html:156` | tabs 模板在“全部”按钮内部混入了排序 SVG 和 `(click)="set_current_tab('active')"` 等孤立属性，“进行中”按钮的起始标签已经丢失。浏览器无法生成预期的第二个 tab，用户不能切换 active 状态，模板也应在编译阶段失败。 | 恢复三个结构完整、互相独立的 button；排序控件移回正确位置。增加模板编译和点击三个 tab 的组件测试。 |
| EXAMPLE-TODO-002 | P1 | `src/app/app.spec.ts:17` | 测试仍断言页面包含 `Hello, todo`，当前 App 不渲染该标题。测试一旦真实执行就会失败，说明示例长期没有进入有效 CI。 | 删除脚手架遗留断言，改为验证当前路由/页面的真实用户行为；先让失败测试暴露模板问题，再修复实现。 |
| EXAMPLE-TODO-003 | P1 | `../../../pnpm-workspace.yaml:6` | `!examples/*` 把整个示例目录排除出 pnpm 工作区，也没有独立 CI。依赖、构建和测试不会随主仓库演进验证，示例可以在数月内悄悄腐烂。 | 将受支持示例纳入工作区和 CI，至少执行安装锁定、typecheck、test、build；若示例故意独立，必须有自己的 lockfile 和独立流水线。 |
| EXAMPLE-TODO-004 | P2 | `src/app/setup_rxdb.ts:12`、`src/app/todo/todo.page.ts:43` | SSR 分支用 `return null as any` 伪造 RxDB 类型，页面状态 Map 和 DOM 查询也使用显式 `any`。示例会教用户绕过 strict，而不是建模“浏览器中才有数据库”的真实状态。 | 用 `RxDB | null` 或明确的浏览器 provider 契约表达状态；给 Map 和 `querySelector` 使用具体类型，删除全部显式 `any`。 |
| EXAMPLE-TODO-005 | P2 | `src/app/todo/todo.page.ts:149` | `ScrollDispatcher.scrolled()` 订阅没有随组件销毁。路由反复进入 Todo 页面会保留旧组件并重复执行 sticky-header 计算。 | 使用 `takeUntilDestroyed()` 绑定组件生命周期，并测试销毁后滚动不再更新状态。 |

## 其余观察 / 测试缺口

- 现有测试只覆盖“能创建 App”和一个过期标题，没有覆盖数据库初始化、Todo CRUD、筛选、排序、滚动或 SSR。
- 示例依赖使用发布版本而不是工作区源码；如果目标是验证当前 monorepo，必须明确测试发布包还是当前源码，不能两边都不验证。
- 模板结构损坏与过期测试同时存在，直接证明当前自动化链路没有执行该项目。

## 验收条件

- 三个 tab 均可键盘和鼠标操作，筛选状态正确，Angular 模板编译无错误。
- 示例纳入可重复的 CI，执行其 typecheck、test 和 production build；单元/组件覆盖率达到 80% 以上。
- 删除生产代码中的显式 `any`，组件销毁后不残留滚动订阅。
