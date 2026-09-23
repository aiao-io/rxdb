# `002-rxdb-model-port` 分支复核 · 2026-09-20

复核对象：当前分支相对 `main` 的实体模型移植变更（已合入 `41ce2181`）。原报告 9 条发现中已修复的部分按本目录约定删除，以下是尚未处理的项目。

## 当前仍未解决

### 1. [P2] E2E 覆盖声明仍不完整

现有 E2E 已覆盖实体列表创建和 Query Builder 页面，但任务 T034 声称的行内编辑、undo/redo、详情 Tab、表单三模式、键盘走查和主题切换仍未逐项验收。
`apps/dev-rxdb-angular-e2e/src/entity-model.spec.ts` 当前只有 3 个用例。应补齐真实行为断言后再勾选 T034。

### 2. [P2] coverage baseline 含无关包下降

`scripts/audit/coverage-baseline.json` 仍包含多个与本功能无关包的历史下降。应恢复无关包基线，仅保留本次新增/受影响包的变化，并单独调查其他回归。

2026-09-22 复核：相对 `41ce2181^`，下降仍在 13 个与 rxdb-model 无关的包上——`code-editor`（100→99 / 100→97）、`rxdb`、`rxdb-adapter-miniprogram`、`rxdb-adapter-sqlite`、`rxdb-adapter-sqlite-core`、`rxdb-adapter-sqlite-wasm`、`rxdb-adapter-sqliteai`（100→95）、`rxdb-client-generator`、`rxdb-devtools`、`rxdb-plugin-search-react`（branches 96→81）、`rxdb-plugin-working-tree`、`rxdb-plugin-workspace`（100→95）、`rxdb-react`。

## 验证记录

- `pnpm nx test rxdb-model --skipRemoteCache --skipNxCache`：871 tests passed。
- `pnpm nx typecheck rxdb-model --skipRemoteCache --skipNxCache`：通过。
- `pnpm nx lint rxdb-model rxdb-model-angular dev-rxdb-angular --skipRemoteCache --skipNxCache`：通过。
- `pnpm nx run dev-rxdb-angular:spec-typecheck --skipRemoteCache --skipNxCache`：通过。
- `pnpm nx test rxdb-model-angular --skipRemoteCache --skipNxCache`：单文件真实表单 16/16、实体列表 35/35 通过；全套并发运行仍有 Angular injector 异步清理错误，未宣称全套通过。
- 全量 `pnpm test-all` 未运行；本报告不声称 affected 全量门禁通过。

报告只保留当前未解决项；两项清空后按 `requirements/reviews/README.md` 约定删除本文件。
