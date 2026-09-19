# Research: 移植 rxdb-model 实体模型库与三框架 UI 组件集

**Feature**: `002-rxdb-model-port` | **Date**: 2026-09-18

前期已完成三路并行探查（企业版核心包 / 企业版 Angular 包 / 开源仓库承接点）与依赖核对，本文件将结论固化为决策记录。无遗留 NEEDS CLARIFICATION。

## D1. 包结构与命名

- **Decision**: 新建 `packages/rxdb-model`（js-lib）与 `packages/rxdb-model-angular`（angular-lib）；后续阶段 `packages/rxdb-model-react` / `packages/rxdb-model-vue`。目录结构沿用企业版模块划分（entity-field/value/structural-equal/entity-form/entity-detail/entity-table/query-builder）。
- **Rationale**: 企业版模块边界已被其测试与消费方验证；宪法文本已预见 `rxdb-model` 包名（覆盖率分级条款）；coverage-check.mjs 自动扫描 packages/ 新包施行 80% 门禁，无需改脚本。
- **Alternatives considered**: ① 并入 `packages/rxdb` 核心——违反 US-025 确立的「核心瘦身、功能外移插件化」方向，且会把 VTable peer 依赖带进核心；② 并入 `packages/utils`——entity-form/table/query-builder 远超通用工具语义，且企业消费方按 `@aiao/rxdb-model` 名引用。

## D2. 核心包 RxDB 依赖面兼容性（已核对）

- **Decision**: 直接依赖 `@aiao/rxdb`（workspace:*），不修改核心公开 API。
- **Rationale**: 企业版对 `@aiao/rxdb` 0.0.25 的全部依赖面已逐一验证存在于开源核心：运行时值 `PropertyType`、`RelationKind` 枚举；类型 `EntityMetadata`/`EntityPropertyMetadata`/`EntityRelationMetadata`/`KeyValuePropertyMetadata`/`OperatorName`/`Rule`/`RuleGroup`；`EntityMetadata` 成员 `propertyMap/computedPropertyMap/foreignKeyRelationMap/relationMap/properties/computedProperties/relations/isForeignKey` 全部兼容。开源核心另有 `isEntityMatchWhere`/`calculateOrderBy`/`QueryRulesBuilder`（未导出）——企业版 query-builder 自带转换器，不依赖 `QueryRulesBuilder`，无需导出新 API。
- **Alternatives considered**: 导出 `QueryRulesBuilder` 供 query-builder 复用——企业版转换器语义（id 剥离/补发、嵌套上限）与其不同，复用需改造核心导出面，收益不抵风险。

## D3. 构建与发布约定

- **Decision**: 核心包按 `rxdb-plugin-search` 惯例：vite 构建 + `vite-plugin-dts`（dts 生成）+ 条件性 codecov 插件；`project.json` 含 `typecheck` 与 `coverage` target；内部依赖用 `workspace:*`；exports 仅 `types/import/default`（不加企业版的 `@aiao/source` 条件）。Angular 包按 `rxdb-angular` 惯例：`@nx/angular:package` + `ng-package.json` + partial 编译（tsconfig.lib.prod.json）+ `nx-release-publish`。
- **Rationale**: 仓库内消费方经 tsconfig paths（`@aiao/<pkg>` → `packages/<pkg>/src/index.ts`）直接解析源码，无需 source 条件；已发布包间引用走 dist。
- **Alternatives considered**: 保留 `@aiao/source` exports 条件——开源包（rxdb-plugin-search 等）均无此条件，引入会打破仓库一致性。

## D4. VTable 版本与内部 API 策略

- **Decision**: `@visactor/vtable` + `@visactor/vtable-editors` 为 peerDependencies（`~1.26.x`），根 devDeps 锁 1.26.6 供测试；深路径类型导入（`@visactor/vtable/es/ts-types/index.js`、`es/ts-types/column/style.js`）与内部方法包装（`vtable-compat.ts`）原样保留；违规在 Complexity Tracking 登记。
- **Rationale**: 企业版已在该版本组合上验证全部编辑器与表格运行时；peer 化使组件包不捆绑引擎（宪法 50KB 预算可达成）。
- **Alternatives considered**: ① 换用仓库既有 ag-grid——需重写 15 个自定义编辑器与剪贴板/键盘/主题体系，成本远高于移植；② 不锁版本——内部 API 使用使升级为破坏性操作，锁版本是唯一可维护选择。

## D5. 图标库替换

- **Decision**: `lucide-angular` → `@lucide/angular`（仓库标准，根 deps 已有 ^1.45.0）。core 的 `lucide-svg.ts` 本身不 import 图标库（纯字符串构建器，`IconData` 为元组类型），仅 spec 的类型导入需要改名。
- **Rationale**: 同一图标数据格式（lucide JSON 元组），API 兼容；仓库 demo 组件已在用 `@lucide/angular`。
- **Alternatives considered**: 引入 `lucide-angular` 旧包——与仓库现有图标栈重复，增加包体积与审计面。

## D6. 样式策略

- **Decision**: 组件使用 Tailwind v4 + daisyUI v5 类名；包发布 `tailwind.css`（`@source` 注册 fesm 产物 + src）但不编译任何 CSS；消费方在 Tailwind 入口 `@import '@aiao/rxdb-model-angular/tailwind.css'`。demo app（dev-rxdb-angular）需在 Tailwind 管线补 `@plugin 'daisyui'`（当前 app CSS 无 daisyUI，根 deps 已有 daisyui ^5.7.37）。
- **Rationale**: 企业版已验证的「app 主题保持权威」模式；仓库宪法要求包体积预算，零 CSS 输出契合。
- **Alternatives considered**: ① 打包 daisyUI 样式——违反宪法包体积预算且主题不可定制；② 自绘样式——重写全部组件模板，放弃移植优势。

## D7. 测试策略与 TDD 顺序

- **Decision**: 核心包 vitest（node 默认 + 7 个 spec 文件头 happy-dom pragma，与企业版一致）；Angular 包 @analogjs + happy-dom + forks pool。**移植顺序 = 先落 spec（新包无 src → 红）→ 再落 src（绿）**，满足宪法 TDD 要求。企业版 6 个旧式「内联复制被测逻辑」spec（entity-list/entity-detail/entity-table/query-table/query-builder.component/entity-form）按 `*.real.spec.ts` 模式重写（真实 TestBed 渲染 + 真实服务，仅浏览器 API 缺失处打桩）。React/Vue 全新开发走标准 TDD。
- **Rationale**: 宪法：「Tests MUST fail for the intended reason before implementation begins」——spec 先行的移植顺序天然构成红→绿；旧假测试对 src 覆盖率 0%，会挂 80% 门禁，必须重写。
- **Alternatives considered**: 代码与测试同步搬运后补红绿记录——无法证明红失败原因，不满足宪法。

## D8. 其他适配决策

- **uuid**: 根 deps 已有 uuid ^14.0.2（含 ESM v7 导出），core 包 deps 声明 `uuid: ^14.0.1` 即可，`generateId()`（v7）无需改动。
- **i18n**: ~30 处中文硬编码（校验消息、操作符 label、列标题）保留——仓库现行惯例为中文；国际化另行立项（spec Assumptions 已声明）。
- **query-builder 本地 `type PropertyType`**: 企业版有意遮蔽 `@aiao/rxdb` 枚举（字符串联合 vs enum），移植保留并加注释说明。
- **过期文件**: `rxdb-model-angular/src/entity-form/rxdb-entity-form-angular.html`（145 行，引用已不存在的方法）不移植；其 Tailwind 类名已全部在 inline template 中。
- **dist 产物**: 企业版包内 dist/ 不随移植提交（开源仓库惯例不含构建产物）。
- **API 基线**: 新增 `requirements/api-baseline/rxdb-model.json` 与 `rxdb-model-angular.json`，经 `pnpm audit:api-surface:update` 落基线、`--check` 门禁（React/Vue 包在各自阶段落）。
- **demo 与 e2e**: dev-rxdb-angular 新增 entity 页面（list/detail/query-builder，数据源 rxdb-test 的 Todo）；React/Vue 阶段在 dev-rxdb-react/vue 加同构页面，e2e 对拍验证（三框架 parity，宪法 III）。
