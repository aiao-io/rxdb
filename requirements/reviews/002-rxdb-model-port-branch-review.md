# `002-rxdb-model-port` 分支复核 · 2026-09-20

复核对象：当前分支相对 `main` 的实体模型移植变更。原报告中的 9 条发现已逐条对照代码和测试复核。

## 已修复并验证

- `structuralEqual` 改为按左右对象对跟踪循环引用，并覆盖共享引用、非对称循环反例。
- 实体详情组件按 `entityId` 从 Repository 读取实例，应用实际变更，等待 `save()` 成功后再关闭/导航；失败留在当前页。
- `EntityListComponent` 未安装 history 插件时使用禁用 undo/redo 的降级 API，不再在构造阶段崩溃。
- Query Builder 移动操作先验证目标分组、循环关系和移动后最大深度，再发布状态；非法目标不会删除源节点。
- Angular 表单增加严格解析入口，非法整数、数字数组和 JSON 会返回结构化错误并保留旧值。
- 恢复 Query Builder demo、路由和菜单入口，E2E 改为断言页面真实可用。

## 当前仍未解决

### 1. [P1] React / Vue 绑定层缺失

规格 FR-011 和任务 T035-T048 要求 React、Vue 与 Angular 能力等价。当前仓库仍只有 `packages/rxdb-model-angular`，因此该 epic 不能标记为三框架完成。

### 2. [P2] E2E 覆盖声明仍不完整

现有 E2E 已覆盖实体列表创建和 Query Builder 页面，但任务 T034 声称的行内编辑、undo/redo、详情 Tab、表单三模式、键盘走查和主题切换仍未逐项验收。应补齐真实行为断言后再勾选 T034。

### 3. [P2] coverage baseline 含无关包下降

`scripts/audit/coverage-baseline.json` 仍包含多个与本功能无关包的历史下降。应恢复无关包基线，仅保留本次新增/受影响包的变化，并单独调查其他回归。

## 验证记录

- `pnpm nx test rxdb-model --skipRemoteCache --skipNxCache`：871 tests passed。
- `pnpm nx typecheck rxdb-model --skipRemoteCache --skipNxCache`：通过。
- `pnpm nx lint rxdb-model rxdb-model-angular dev-rxdb-angular --skipRemoteCache --skipNxCache`：通过。
- `pnpm nx run dev-rxdb-angular:spec-typecheck --skipRemoteCache --skipNxCache`：通过。
- `pnpm nx test rxdb-model-angular --skipRemoteCache --skipNxCache`：单文件真实表单 16/16、实体列表 35/35 通过；全套并发运行仍有 Angular injector 异步清理错误，未宣称全套通过。
- `tri-framework-check`：React / Vue 绑定包仍不存在，失败符合当前未解决项。
- 全量 `pnpm test-all` 未运行；本报告不声称 affected 全量门禁通过。

报告只保留当前未解决项；三项清空后按 `requirements/reviews/README.md` 约定删除本文件。
