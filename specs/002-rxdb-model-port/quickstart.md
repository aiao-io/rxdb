# Quickstart: rxdb-model 移植验证指南

**Feature**: `002-rxdb-model-port`

本文件是各阶段交付的可运行验证场景。数据模型见 [data-model.md](./data-model.md)，公开 API 契约见 [contracts/](./contracts/)。

## 前提

- pnpm 10 + Nx 23 工作区（仓库根安装完成）
- 阶段开始前先落依赖：根 package.json 增 `@visactor/vtable ~1.26.x`、`@visactor/vtable-editors ~1.26.x`（devDeps，供测试），`pnpm install`
- 每个阶段结束的公共门禁：`pnpm nx run-many -t lint test build --projects=tag:js-lib`（核心包）/ 对应 angular 包 target

## Phase 2 — 核心包（packages/rxdb-model）

**先红后绿**：每模块先落 `*.spec.ts` → `pnpm nx test rxdb-model --watch` 确认红（编译失败/断言失败）→ 落 src → 绿。

1. 脚手架后冒烟：`pnpm nx test rxdb-model` 全部通过（node + happy-dom pragma 环境）。
2. 类型与 lint：`pnpm nx typecheck rxdb-model && pnpm nx lint rxdb-model` 零错误零警告。
3. 构建与体积：`pnpm nx build rxdb-model`，dist 生成 `index.d.ts`；gzip 体积 < 50 KB（vite `reportCompressedSize` 输出为证据）。
4. 覆盖率：`pnpm nx run rxdb-model:coverage`，四项指标 ≥80%（`pnpm audit:coverage --projects=rxdb-model` 通过）。
5. API 基线：`pnpm audit:api-surface:update` 落 `requirements/api-baseline/rxdb-model.json`，随后 `pnpm audit:api-surface --check` 通过。
6. 契约抽验：node REPL/临时脚本调用 `extractEntityFields`/`buildFormFields`/`buildEditableColumns`/`createQueryBuilderService`，用 `rxdb-test` 的 Todo 实体元数据断言派生结果（对应 spec US1 验收场景 1–8）。

## Phase 5 — Angular 包（packages/rxdb-model-angular）

1. 假测试重写先行（红）：6 个 `*.real.spec.ts` 落在组件不存在时全红 → 组件落位后全绿。
2. `pnpm nx test rxdb-model-angular` 全绿（@analogjs + happy-dom）。
3. `pnpm nx build rxdb-model-angular` 产出 partial 编译（AOT 可链接）；gzip < 50 KB。
4. API 基线：落 `rxdb-model-angular.json`（含 `tailwind.css` 子路径 exports）。
5. Demo 页验证（dev-rxdb-angular）：
   - Tailwind 管线补 `@plugin 'daisyui'` 后启动 `pnpm nx serve dev-rxdb-angular`；
   - entity 页用 Todo 实体：列表行内编辑 + 撤销/重做、详情 Tab、表单三模式、查询构建器构建条件并过滤；
   - 键盘走查：Tab 焦点顺序、Ctrl/Cmd+Z 撤销、表格复制/粘贴、条件增删全键盘可达；
   - 深色/浅色主题切换无样式残留。
6. e2e：`pnpm nx e2e dev-rxdb-angular-e2e`（含新 entity 页用例）。

## Phase 6 — React/Vue 绑定与三端对拍（epic 关闭门禁）

1. 各包按标准 TDD 开发，`pnpm nx test rxdb-model-react / rxdb-model-vue` 全绿。
2. dev-rxdb-react / dev-rxdb-vue 落同构 demo 页，`pnpm nx serve` 三端人工/脚本比对。
3. 对拍 e2e：相同 Todo 数据下断言三端列表/详情/表单/查询构建器的输出一致（`pnpm nx e2e dev-rxdb-*-e2e`）。
4. `tri-framework-check` 技能复核三端 API 对称性。
5. 全量门禁：`pnpm test-all` + `pnpm audit:coverage` + `pnpm audit:api-surface --check`。

## 全程门禁（每阶段提交前）

| 门禁             | 命令                                            |
| ---------------- | ----------------------------------------------- |
| 单包测试         | `pnpm nx test <pkg> --coverage`                 |
| lint / typecheck | `pnpm nx lint <pkg> && pnpm nx typecheck <pkg>` |
| 构建             | `pnpm nx build <pkg>`                           |
| API 基线         | `pnpm audit:api-surface --check`                |
| 覆盖率           | `pnpm audit:coverage --check`                   |
| 全量（CI 门禁）  | `pnpm test-all`                                 |
