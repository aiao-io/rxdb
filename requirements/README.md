# 需求管理

这里维护 aiao 的用户故事、史诗和状态总览。这个目录不是“想法回收站”，而是当前实现范围、优先级和完成状态的业务入口。

## 真相源规则

所有 story 的 YAML `status` 字段（`stories/*/US-*.md`）是状态的**唯一真相源**。

其他地方（`status-overview.md`、各 epic 文件）都是它的派生视图，不允许独立维护。出现冲突时以 YAML 为准，并同步修复派生视图。

### 父故事（共享契约文档）

个别 story 因 INVEST「Small」不成立而被拆分，原文件保留为**父故事**：只承载子故事共享的契约、设计决策与不变式，
**不直接交付**。目前只有 [US-012](stories/core/US-012-field-semantic-metadata.md)（子故事 US-012a/b/c）属于这一类。

父故事的 `status` 仍然参与计数（它要等所有子故事 Done 才能置 Done），但在 `status-overview.md` 和 epic 列表中
用 `📄` 而非 `⬜` 标记，并把子故事缩进列在其下，避免读者以为它是一条可以直接开工的交付项。
拆分理由必须写进父故事 INVEST 清单的 `Small` 一项，说明拆分日期与承接的子故事编号。

## 目录结构

- `epics/`: 史诗目标与阶段划分
- `stories/`: 按领域拆分的用户故事
- `template.md`: 新建 story 的模板
- `status-overview.md`: 状态索引（不含变更日志）
- `CHANGELOG.md`: 完成记录与 spec 关闭日志

`stories/` 子目录：

| 目录             | 内容                                                        | 编号段     |
| ---------------- | ----------------------------------------------------------- | ---------- |
| `core/`          | 核心引擎                                                    | US-001~099 |
| `framework/`     | Angular / React / Vue 集成                                  | US-101~199 |
| `adapter/`       | SQLite / PGlite / Supabase / sqliteai / 小程序 / 桌面适配器 | US-201~299 |
| `collaboration/` | 版本控制、撤销/重做、迁移协作                               | US-301~399 |
| `ui/`            | 代码编辑器等跨框架 UI 组件                                  | US-401~499 |
| `plugin/`        | RxDB plugin 包（workspace / storage / graph）               | US-501~599 |
| `future/`        | 中长期规划                                                  | US-700~999 |

## 状态定义

| 状态          | 含义                       |
| ------------- | -------------------------- |
| `Backlog`     | 已确认要做，但还没开始     |
| `In Progress` | 正在实现                   |
| `In Review`   | 代码已完成，等待审核或收尾 |
| `Done`        | 已合并，当前仓库能力已覆盖 |
| `Blocked`     | 被外部依赖或前置条件卡住   |

## 跨故事 AC 转移

当一个 story 的某条 AC 被推迟到另一个 story 实现，**不要**只在源 story 的 HTML 注释里写 `<!-- deferredACs: AC#X→US-NNN -->`。

在 **接收方** story 的 frontmatter 加 `inherited_acs` 字段：

```yaml
inherited_acs:
  - from: US-NNN
    ac: N
    note: 简述为什么这条 AC 从源故事迁来
```

源 story 文件本体注释保留作为反向索引可读性辅助，但接收方 YAML 是机器可读的真相。

## 命名规范

- 用户故事：`US-XXX-description.md`
- 拆分出的子故事：`US-XXXa-description.md` / `US-XXXb-…`，沿用父故事编号加小写字母后缀，不占用新编号段
- 史诗：`epic-XXX-name.md`

## 工作流

1. 从 `template.md` 复制出新 story
2. 选正确领域目录、未占用编号
3. 完整填写 frontmatter（id / title / status / priority / epic / created / updated / tags）、目标、AC 表、范围边界、实现文件
4. 推进过程中持续更新 `status`、`priority`、`updated`、`References`
5. 合并后：YAML `status: Done`，补 PR 链接，在 `CHANGELOG.md` 加一行

## 功能建议与排期

以下建议基于当前能力矩阵和未完成 story 汇总。它们是排期建议，不改变各 story
frontmatter 中的 `status`；实现时仍以对应 story 的验收标准为准。

| 优先级 | 建议功能                             | 对应 story                                                               | 建议理由                                                                              | 主要交付边界                                                                                                       |
| :----: | ------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
|   P0   | 跨 realm writer lease 与迁移 fencing | [US-304](stories/collaboration/US-304-writer-lease-migration-fencing.md) | 直接影响迁移期间的数据一致性；旧 writer 失效前不能允许发布类型系统升级                | lease/guard 表、drain barrier、epoch fencing、崩溃恢复、多进程/Worker 回归套件                                     |
|   P1   | 字段 format 声明与注册期校验         | [US-012a](stories/core/US-012a-field-format-declaration.md)              | US-012 系列的地基：`FieldFormat` 判别联合不冻结，DTO 和值校验都无从落地               | 16 个 format 接口、`PropertyType × format` 相容表、注册期聚合校验                                                  |
|   P1   | 实体字段描述 DTO                     | [US-012b](stories/core/US-012b-entity-fields-dto.md)                     | 让生成器、三框架和 DevTools 使用同一份字段语义，避免按字段名猜测展示规则              | 派生 `cardinality/source`、`ENTITY_FIELDS_DTO_VERSION`、`describeEntityFields()` / `parseEntityFieldsDescriptor()` |
|   P1   | Electron/Tauri 桌面本地 SQLite       | [US-207](stories/adapter/US-207-desktop-local-database.md)               | 补齐桌面端文件持久化和重启恢复，扩大 Local-first 的实际使用场景                       | Electron/Tauri **SQLite 文件**路径、共享桌面 host 契约、类型化 IPC、真实文件 smoke test                            |
|   P2   | 提交图与 HEAD 持久化                 | [US-305](stories/collaboration/US-305-commit-graph-head.md)              | 旧暂存导出已在 `0.0.24` 删除，能力缺口现在完全敞开，但需要 US-304 的 fencing 打底     | 独立命名空间的新契约、commit 存储布局、baseline commit 与一次性迁移                                                |
|   P2   | 字段值校验与生成器透传               | [US-012c](stories/core/US-012c-field-value-validation-codegen.md)        | 有了 DTO 才谈得上运行时校验；单独成条以免和 DTO 一起变成不可验收的大块                | `validateFieldValue()`、D12 归一化、生成器透传、三框架 fixture 复用                                                |
|   P2   | Electron PGlite 数据目录与事务宿主   | [US-208](stories/adapter/US-208-electron-pglite-data-directory.md)       | PGlite callback transaction 不能跨 IPC 序列化，需要 SQLite 路径不需要的事务 host 协议 | 主进程 data directory、事务 ID 协议或主进程托管 adapter、跨进程类型保真                                            |
|   P2   | PGlite 原生全文搜索                  | [US-703](stories/future/US-703-pglite-full-text-search.md)               | SQLite FTS5 已完成，PGlite 搜索缺口会造成适配器能力不对称                             | `tsvector/GIN/trigger`、存量回填、`tsquery` 排序/snippet/分页、三框架 parity                                       |
|   P3   | 小程序适配器门禁与文档收尾           | [US-209](stories/adapter/US-209-miniprogram-adapter.md)                  | 包已发布但不在覆盖率 baseline、不在兼容性矩阵，且根 README 声称支持 Alipay 与实现不符 | 覆盖率 baseline 登记、`/runtime` 子路径 API baseline 决策、compatibility.md、README 表述修正                       |

> US-306 / US-307 / US-308 不在本表单列——它们是 US-305 的后续交付，排期跟随
> [epic-006](epics/epic-006-working-tree-commits.md) 内部的固定顺序。

### 排期约束

1. 先完成 US-304，再允许涉及系统 schema 或 change codec 的新迁移进入发布分支。
2. US-012 系列可与 US-304 并行设计，但其 DTO 不得重新定义 `bigint/binary` 的值 wire codec。
   系列内部必须按 **US-012a → US-012b → US-012c** 顺序交付；`US-012` 本体自 2026-08-13 起降级为共享契约文档，不直接交付。
3. US-207 必须先锁定 Tauri/Electron SQLite 的真实连接语义并抽出共享桌面 host 契约；无法保证单连接事务时应 fail-fast，不得降级成伪事务。
4. US-208 排在 US-207 之后，复用其抽出的 host 契约；两种事务 host 方案（IPC 事务 ID 协议 / adapter 完整托管在主进程）必须先通过同一套事务与事件测试再冻结选择。
5. US-305 必须排在 US-304 之后：其跨 realm 提交校验建立在 writer lease / epoch fencing 之上，不允许另起一套协调协议。
   epic-006 内部顺序为 **US-305 → US-306 → US-307 → US-308**，后一个依赖前一个的存储布局；US-308 额外要求 US-304 已 Done。
6. US-703 应复用现有搜索公开 API 和跨框架 parity fixture，不为 PGlite 增加 SQLite 专属 fallback。
7. US-209 只做门禁与文档收尾，不扩大小程序适配器的能力承诺：WAL、多页面并发、崩溃恢复保证和微信以外的小程序平台都不进入范围；
   文档必须写明「实验性」而不是把它列成与 wa-sqlite 同级的受支持适配器。

### 建议补充的验收维度

- **故障恢复**：迁移者、writer、桌面 host 或搜索索引初始化中途崩溃后，重试结果必须可预测且不可产生半状态。
- **能力矩阵**：SQLite family、PGlite、Electron、Tauri、Angular、React、Vue 的支持/不支持组合必须在 story 和公开文档中显式列出。
- **发布门禁**：新增公开 API 同步更新 API baseline、TSDoc、覆盖率门禁和跨框架 parity 测试。
- **可观测性**：连接、迁移、fencing、索引回填失败应提供稳定错误码和可诊断上下文，不静默回退到 memory、OPFS 或 IndexedDB。

## 提交与 PR 关联方式

story ID 是仓库内的需求编号，不是 GitHub issue 编号。**不要**写成 `Closes #US-001`。

推荐写法：

```text
feat(core): implement model decorators

Refs: US-001
```

PR 描述：

```text
## Related Stories
- US-001
- US-002
```

## 快速导航

- [核心 MVP](epics/epic-001-core-mvp.md)
- [数据同步与协作](epics/epic-002-data-sync.md)
- [UI 与开发者工具](epics/epic-003-ui-developer-tools.md)
- [未来功能](epics/epic-004-future-features.md)
- [类型系统演进](epics/epic-005-type-system-evolution.md)
- [本地工作树与提交历史](epics/epic-006-working-tree-commits.md)
- [状态概览](status-overview.md)
- [完成记录](CHANGELOG.md)
