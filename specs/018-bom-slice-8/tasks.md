# Tasks: epic-009 首轮切片第 8 步（demo UX 产品化 + 阶段 E）

## Phase 0: 文档与打底（主会话）

- [ ] T001 specs/018 的 spec/plan/tasks（本文件）
- [ ] T002 共享面打底：entities 加 `BomConfigChar` / `BomConfigCharValue` / `BomConfigCondition` / `BomConfigConstraint` / `BomAttrDef` 五实体 + `bom_line_occurrence` 加 `unitFrom`/`unitTo`/`lotCodes`/`selectionConditionId` 列 + `bom_item`/`bom_header`/`bom_line_occurrence` 加 `ext` 列 + `ResolutionContext` 扩 `configSelection`/`unit`/`lot` + index 导出 + 触发器 DDL 骨架；schema 测试红→绿
- [ ] T003 提交打底（子任务基于此后并行开工）

## Phase 1: 并行子任务（各写各自新文件 + 各自测试文件；禁跑 nx 测试，语法用 esbuild 自检）

- [ ] T004 【子任务 A】demo UX 产品化：应用壳（sidebar/header/路由六页）+ 页面拆分 + 视觉统一 + 加载/空/错误态；既有 e2e 的 testid 与行为保持
- [ ] T005 【子任务 B】US-517 配置模型：选择条件解析器（手写递归下降，无正则）+ AST 求值 + 保存期校验 + 解析过滤与 manifest + 冲突/缺参报错；`bom-config.spec.ts` 红→绿（AC#1~#7）
- [ ] T006 【子任务 C】US-518 序列/批次：三维有效域重叠判定（TS 校验 + 双后端触发器）+ 解析过滤 + `unresolved` 候选列出；`bom-unit-lot.spec.ts` 红→绿（AC#1~#10）
- [ ] T007 【子任务 D】US-519 扩展属性：`ext` 序列化 + 写入期 attr_def 校验 + 过滤查询（双后端同结果 + 类型不符拒绝）；`bom-ext-attr.spec.ts` 红→绿（AC#1/#2/#4/#5/#6）
- [ ] T008 【子任务 E】US-521 导出导入：`exportBom` 契约 + `importBomDraft` 整批原子（逐行诊断、行序无关、环/重复/引用缺失/十进制非字符串）；`bom-import-export.spec.ts` 红→绿（AC#1~#15）

## Phase 2: 集成与消费面（主会话，串行）

- [ ] T009 主会话集成：子任务代码合并进插件（冲突解决、共享面收口）、全量测试红→绿
- [ ] T010 种子 E 层（attr_def rohs / 136-137 序列段 / 颜色红蓝特征+条件+互斥约束）+ `SCOOTER_GOLDEN_E` 手写
- [ ] T011 demo 阶段 E 页面（扩展属性面板 / unit 输入展开 / 配置选择面板 / 导出导入面板）+ e2e 第 18~21 条（AC#17~#20）
- [ ] T012 UX 升级回归：e2e 1~17 条在新 UI 下全绿

## Phase 3: 门禁与回写（主会话）

- [ ] T013 插件收尾（lint/typecheck/test、覆盖率 ≥ 80%、api-baseline、audit:* 五门禁、format:check）
- [ ] T014 affected full + 修复（Node 26 + ELECTRON_MIRROR 一致 env）
- [ ] T015 故事回写（US-517/518/521 全量、US-519 部分、US-525 阶段 E）+ epic/status-overview/roadmap 第 8 步记录 + specs/018 quickstart
- [ ] T016 提交

## 并行纪律

- 子任务只写**各自的新文件**（模块 + spec）；entities.ts / index.ts / ResolutionContext / 触发器 DDL / 测试工具等共享面一律主会话改（T002 一次打底）。
- 子任务**禁跑 nx 测试/构建**（资源与缓存竞争）；语法自检用 `node -e esbuild.transform`。
- 全部子任务完成后主会话串行集成验证（先 lint/typecheck 再全量 test）。
