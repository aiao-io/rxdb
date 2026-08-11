# `@modules/angular-todo` 代码评审

## 结论

🟡 部分通过。两套页面的订阅泄漏和显式 `any` 已清理，Nx 已能发现并执行测试，但当前只有公共入口加载测试，核心页面行为仍缺少自动回归保护。

## 修复状态（2026-07-15）

- ANGULAR-TODO-002、ANGULAR-TODO-003、ANGULAR-TODO-004 已修复。
- ANGULAR-TODO-001 部分修复：已增加 Nx 自动推断的 `test` target，测试配置已纳入两个页面源码，并新增公共入口加载测试；页面行为测试仍缺失。
- `test`（1 个）、`lint`、`typecheck`、`build` 全部通过。

## 评审基线

- 基线提交：`03a46a5d5992a958c19ae33d5fed15c9c3322021`
- 评审日期：2026-07-14
- 范围：`modules/angular-todo` 下 `todo-page`、`todo-cursor-page`、公共入口、打包配置和 Nx 配置
- 自动校验：修复后已执行 `pnpm nx test angular-todo --skipNxCache`，并验证 `lint`、`typecheck`、`build`
- 测试现状：Nx 已自动推断 `test` target，`tsconfig.spec.json` 已包含两个业务入口；当前仅有 1 个公共入口加载测试

## 问题

| ID               | 级别 | 位置                                                                      | 问题与影响                                                                                                                                                               | 建议                                                                                                                   |
| ---------------- | ---- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| ANGULAR-TODO-001 | P1   | `tsconfig.spec.json`、`vite.config.mts`、`src/public-entrypoints.spec.ts` | 测试发现与源码纳入问题已修复，Nx 能执行 Vitest 并加载两个公共入口；但当前测试没有实例化页面，也未覆盖编辑、分页、销毁和游标加载，仍无法阻止核心行为回归。                | 为两个页面补可执行组件测试，覆盖滚动订阅销毁、创建编辑、分页与游标加载，并按仓库门槛验证覆盖率。                       |
| ANGULAR-TODO-002 | P1   | `todo-page/todo.page.ts:148`                                              | `ScrollDispatcher.scrolled()` 的订阅没有绑定组件销毁。页面反复进入退出后，旧实例仍接收全局滚动事件并持有 DOM/Signal 引用，造成内存泄漏和重复计算。                       | 注入 `DestroyRef` 并使用 `takeUntilDestroyed()`，补充组件销毁后不再更新 sticky header 的测试。                         |
| ANGULAR-TODO-003 | P1   | `todo-cursor-page/todo-cursor.page.ts:122`                                | `elementScrolled()` 订阅同样没有 teardown。组件销毁后仍可能继续调用 `resource.loadMore()`，造成幽灵查询、重复加载和状态写入已销毁视图。                                  | 使用 `takeUntilDestroyed()` 或将滚动流交给模板/资源层管理；测试销毁后滚动不再触发 `loadMore()`。                       |
| ANGULAR-TODO-004 | P2   | `todo-page/todo.page.ts:43`、`todo-cursor-page/todo-cursor.page.ts:40`    | 两个页面用 `Map<any, ...>` 丢掉实体键类型，又用 `querySelector(...) as any` 绕过可空性。类型系统无法阻止错误实体键和缺失 input，违反 TS strict 与禁用 `any` 的仓库铁律。 | 给状态 Map 使用明确实体或主键类型；让 `querySelector<HTMLInputElement>()` 保留 `null` 并显式处理。删除全部显式 `any`。 |

## 其余观察 / 测试缺口

- 两个页面包含高度相似的编辑状态、滚动和分页逻辑，缺陷已经发生对称复制，应提取共享的类型安全行为而不是继续双份维护。
- 没有页面创建、编辑、分页、销毁或游标加载测试，当前 1 个入口加载测试不能证明达到 80% 覆盖率。
- `ngOnInit()` 只有空的浏览器判断，没有建立可验证的初始化契约。

## 验收条件

- 两个页面均有可执行的单元测试，且测试配置真实覆盖其源码和 spec。
- 组件销毁后所有滚动订阅停止，重复挂载不会增加事件处理次数。
- 删除生产代码中的显式 `any`，通过 `pnpm nx lint angular-todo`、`pnpm nx test angular-todo` 和 `pnpm nx build angular-todo`，覆盖率达到 80% 以上。
