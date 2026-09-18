# Implementation Plan: 移植 rxdb-model 实体模型库与三框架 UI 组件集

**Branch**: `002-rxdb-model-port` | **Date**: 2026-09-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-rxdb-model-port/spec.md`

## Summary

将企业版 `@aiao/rxdb-model`（框架无关实体模型核心：字段工具、结构比较、表单/详情构建器、VTable 表格基础设施与编辑器、query-builder 引擎）与 `@aiao/rxdb-model-angular`（Angular 组件层）移植为开源 monorepo 的 `packages/rxdb-model`（js-lib）与 `packages/rxdb-model-angular`（angular-lib）。策略：Angular 先行，React/Vue 绑定为同一 epic 后续阶段（epic 关闭前三端对称）。移植以「先落 spec（红）→ 再落 src（绿）」的 TDD 顺序进行；企业版 6 个旧式假测试重写为真实源码测试。表格引擎保留 VTable 选型（peer 依赖、锁 1.26.x），样式遵循 Tailwind + daisyUI 类名约定（组件包不发布编译 CSS）。

## Technical Context

**Language/Version**: TypeScript 6.0 strict + ESM（仓库现行版本，宪法下限 TS 5.9）

**Primary Dependencies**: `@aiao/rxdb`（workspace:*，依赖面已核对 100% 兼容）、`rxjs ^7.8.2`、`uuid ^14`（v7）；peer：`@visactor/vtable ~1.26.x`、`@visactor/vtable-editors ~1.26.x`；Angular 包另加 `@angular/core|common|forms|cdk` 22.x、`@lucide/angular`（替代企业版 `lucide-angular`）、`@aiao/rxdb-angular`（`InfiniteScrollingList`）

**Storage**: N/A（纯库；数据由消费方的 RxDB 实例提供）

**Testing**: Vitest 4（核心包 node 环境 + 按文件的 happy-dom pragma；Angular 包 @analogjs + happy-dom + forks pool）；跨框架对拍用 Playwright（dev-rxdb-*-e2e 已存在）

**Target Platform**: 浏览器（消费方应用）+ Node（核心包纯逻辑测试）；不直接支持 SSR（企业版同）

**Project Type**: Nx monorepo 库包（js-lib + angular-lib）

**Performance Goals**: 单包 gzip < 50 KB（宪法预算）；本地数据行内编辑/查询变更/校验反馈 < 100 ms；demo 首绘 < 1.5 s；VTable 为 peer 不计入包体积

**Constraints**: 三框架 API 对称；WCAG 2.1 AA；api-baseline 门禁（`pnpm audit:api-surface`）；覆盖率门禁 rxdb-model ≥80% 四指标（coverage-check.mjs 自动纳入 packages/ 新包，无需改脚本）；TSDoc 覆盖全部公开导出；无根级副作用 import

**Scale/Scope**: 核心包 ~14.5k 行 src + 20 spec（~6.4k 行）；Angular 包 ~5.5k 行 src + 11 spec（其中 6 个重写）；React/Vue 绑定为全新开发（各 ~30 文件量级）

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| 原则                | 检查项                                                                                                                                                                                                           | 结论                                                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| I. 代码质量         | TS strict 零错误、ESLint 零警告、禁 any、嵌套 ≤3、单职责；TSDoc 覆盖全部公开导出；无死代码/TODO；无根级副作用 import                                                                                             | 通过（附注 1：企业代码 TSDoc 缺失 → 任务清单含逐模块 TSDoc 补齐；附注 2：VTable 内部 API 适配与剪贴板兜底在 Complexity Tracking 登记） |
| II. 测试标准        | TDD 红→绿：移植顺序 = 先落 spec（对不存在的新包红）→ 再落 src（绿）；假测试重写为真实源码测试；测试确定性（happy-dom 固定环境、无网络/无 setTimeout 竞态）；coverage-check.mjs 自动对 rxdb-model 施行 80% 四指标 | 通过（React/Vue 全新开发按标准 TDD）                                                                                                   |
| III. 用户体验一致性 | parity scope 已在 spec 声明（Angular 先行、React/Vue 同 epic 补齐，epic 关闭前三端不得单端缺失）；三端 demo 页 + e2e 对拍验证视觉与行为一致；WCAG 2.1 AA（键盘全操作、焦点管理）；加载/空/错误三态定义           | 通过                                                                                                                                   |
| IV. 性能            | 包体积预算（vite `reportCompressedSize` 实测证据）；交互预算 <100 ms（demo 插桩）；首绘 <1.5 s；无副作用根导入（audit 检查）                                                                                     | 通过                                                                                                                                   |
| 工程护栏            | 技术栈版本均在宪法下限之上（Angular 22 / TS 6 / Nx 23 / pnpm 10）；交付流程 spec→plan→tasks→implement                                                                                                            | 通过                                                                                                                                   |

## Project Structure

### Documentation (this feature)

```text
specs/002-rxdb-model-port/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output（公开 API 契约）
└── tasks.md             # Phase 2 output（/speckit-tasks，本命令不创建）
```

### Source Code (repository root)

```text
packages/rxdb-model/                      # Phase 2–4：框架无关核心（js-lib，参照 rxdb-plugin-search 惯例）
├── project.json / package.json / tsconfig*.json / vite.config.mts / eslint.config.mjs
└── src/
    ├── index.ts                          # 导出 30 个叶子模块（企业版结构原样）
    ├── entity-field.utils.ts (+ .spec.ts)
    ├── entity-value.utils.ts (+ .spec.ts)
    ├── structural-equal.ts (+ .spec.ts)
    ├── entity-form/                      # form-data / form-fields / form-validation / interfaces (+ spec)
    ├── entity-detail/                    # detail-tabs / interfaces (+ spec)
    ├── entity-table/
    │   ├── interfaces.ts
    │   ├── columns/                      # column-utils / build-editable-columns (+ specs)
    │   ├── editors/                      # 15 个 VTable 编辑器 + lucide-svg (+ specs)
    │   └── vtable/                       # table-factory / clipboard / keyboard / operations / theme / tooltip / vtable-compat (+ specs)
    └── query-builder/
        ├── models/                       # operator.interface / config.interface / validation.interface / query-builder-state (+ spec)
        ├── services/                     # query-builder / operator-registry / query-converter / schema-parser / validation (+ specs)
        └── utils/                        # field-tree / metadata-field-extractor / schema-factory / value-input / date / id / popover-position / structural-equal (+ specs)

packages/rxdb-model-angular/              # Phase 5：Angular 组件层（angular-lib，参照 rxdb-angular 惯例）
├── project.json / package.json / ng-package.json / tailwind.css
└── src/
    ├── index.ts
    ├── entity-list/ entity-form/ entity-detail/ entity-dialog/
    ├── entity-table/                     # entity-table / query-table 组件 + ENTITY_TABLE_CONFIG token
    └── query-builder/                    # 9 个组件 + theme token（query-builder/query-group/query-rule/field-selector/
                                          #   operator-selector/value-input/tree-select/popover-select/subquery-builder）
                                          # 含 6 个旧式 spec 重写为 *.real.spec.ts

packages/rxdb-model-react/                # Phase 6：React 绑定（全新开发，TDD）
packages/rxdb-model-vue/                  # Phase 6：Vue 绑定（全新开发，TDD）

apps/dev-rxdb-angular/src/app/pages/entity/   # Phase 5：entity list/detail/query-builder demo 页（daisyUI 管线接入）
apps/dev-rxdb-react|vue/...                    # Phase 6：同构 demo 页 + e2e 对拍
requirements/api-baseline/rxdb-model.json      # Phase 2：API 基线（rxdb-model-angular/react/vue 各阶段落）
```

**Structure Decision**: 沿用企业版包名与目录结构（模块边界已被其测试与消费方验证）；开源侧仅按仓库惯例调整构建配置（vite/ng-packagr、workspace:* 依赖、无 `@aiao/source` exports 条件——仓库内通过 tsconfig paths 直接解析 src）。

## Complexity Tracking

> Constitution I：「Added abstractions, fallback layers, or branching complexity MUST be justified；workaround code that masks missing upstream contracts MUST be removed or rejected」

| Violation                                                                                                                | Why Needed                                                                                                                                                              | Simpler Alternative Rejected Because                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VTable 内部 API 适配层（`vtable-compat.ts` 包装未导出方法；`table-operations.ts` monkey-patch 内部属性以禁用只读行拖拽） | 上游 @visactor/vtable 1.26.x 不公开这些契约点（官方类型未导出内部方法；只读行拖拽禁用无公开开关）。移除会导致：只读行可被拖拽重排产生错误写入，或单元格编辑状态无法收敛 | ① fork vtable：维护成本不可接受；② 放弃只读行拖拽禁用：数据正确性缺陷；③ 子类化 ListTable：上游未为此设计且同样依赖内部字段，无收益。收敛措施：全部内幕集中在 `vtable-compat.ts` 单一文件 + 版本锁 `~1.26.x` + 每方法回归测试（vtable-compat.spec.ts）+ vtable 升级时先行回归 |
| 剪贴板兜底路径（`table-clipboard.ts` try/catch 降级内部剪贴板）                                                          | 浏览器剪贴板 API 依权限策略可被拒绝——这是外部运行时契约，非代码缺陷；spec Edge Cases 要求复制/粘贴在拒绝时仍可用                                                        | ① 拒绝时禁用复制粘贴：体验回退且违背 spec；② 提示用户授权后重试：仍需处理失败路径，复杂度不降。兜底为单一路径并有测试覆盖（table-clipboard.spec.ts 596 行）                                                                                                                   |
