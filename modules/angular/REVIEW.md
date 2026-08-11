# `@modules/angular` 代码评审

## 结论

🟢 好。Service Worker 生命周期已修复，项目已有可执行的 Vitest target 和生命周期契约测试。

## 修复状态（2026-07-15）

- ANGULAR-MODULE-001 已修复：`disable()` 释放全部订阅、复位状态并允许再次启用。
- ANGULAR-MODULE-002 已修复：Nx 自动发现 Vitest target，3 个生命周期测试通过。
- 覆盖率：语句 81.39%、函数 88.88%、行 84.61%；`lint`、`typecheck`、`build` 全部通过。

## 评审基线

- 基线提交：`03a46a5d5992a958c19ae33d5fed15c9c3322021`
- 评审日期：2026-07-14
- 范围：`modules/angular` 下源码、公共入口、打包配置和 Nx 配置
- 自动校验：本轮仅执行静态只读审查，未单独运行 `lint`、`build` 等 Nx 任务
- 测试现状：项目没有 `test` target，源码下未发现 spec/test 文件

## 问题

| ID                 | 级别 | 位置                                    | 问题与影响                                                                                                                                                                                                                                                                            | 建议                                                                                                                                                                                             |
| ------------------ | ---- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ANGULAR-MODULE-001 | P1   | `src/services/sw-updates.service.ts:20` | `disable()` 只对 `onDisable` 调用 `next()`，但没有任何流消费这个 Subject；`enable()` 创建的 interval、`unrecoverable` 和两条 `versionUpdates` 订阅因此永久存活。`#enabled` 也从不复位，停用后既没有真的停，也无法重新启用。组件销毁、测试重建或应用热切换都会累积订阅和后台更新检查。 | 用单一生命周期信号配合 `takeUntil`/`takeUntilDestroyed` 约束全部订阅；`disable()` 必须完成取消并复位 `#enabled`，`ngOnDestroy()` 再完成内部 Subject。补充 enable → disable → enable 的契约测试。 |
| ANGULAR-MODULE-002 | P1   | `project.json:9`、`tsconfig.spec.json`  | 项目只有 `build` 和 `lint`，没有 `test` target，仓库也没有任何 spec。当前生命周期缺陷不会被 CI 捕获，发布包等于裸奔。                                                                                                                                                                 | 增加 Vitest/Angular 测试 target，把 service worker 可用、不可用、重复 enable、disable 和 destroy 分支纳入测试；覆盖率至少达到非核心包 80% 门槛。                                                 |

## 其余观察 / 测试缺口

- `SwUpdatesService` 同时管理定时器、三条订阅和状态位，却没有统一的 teardown 所有权。
- `disable()`、`ngOnDestroy()`、SSR、`SwUpdate.isEnabled === false` 均无自动化验证。
- 当前 `tsconfig.spec.json` 的存在不能替代可执行的 Nx `test` target。

## 验收条件

- `disable()` 后不再触发检查或转发版本事件，并允许后续 `enable()` 只创建一组订阅。
- 增加并通过 `pnpm nx test angular`，覆盖率达到 80% 以上。
- 通过 `pnpm nx lint angular` 和 `pnpm nx build angular`，ESLint 零警告。
