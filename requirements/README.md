# 需求管理

这里维护 aiao 的用户故事、史诗和状态总览。这个目录不是“想法回收站”，而是当前实现范围、优先级和完成状态的业务入口。

## 真相源规则

所有 story 的 YAML `status` 字段（`stories/*/US-*.md`）是状态的**唯一真相源**。

其他地方（`status-overview.md`、各 epic 文件）都是它的派生视图，不允许独立维护。出现冲突时以 YAML 为准，并同步修复派生视图。

## 目录结构

- `epics/`: 史诗目标与阶段划分
- `stories/`: 按领域拆分的用户故事
- `template.md`: 新建 story 的模板
- `status-overview.md`: 状态索引（不含变更日志）
- `CHANGELOG.md`: 完成记录与 spec 关闭日志

`stories/` 子目录：

| 目录             | 内容                                          | 编号段     |
| ---------------- | --------------------------------------------- | ---------- |
| `core/`          | 核心引擎                                      | US-001~099 |
| `framework/`     | Angular / React / Vue 集成                    | US-101~199 |
| `adapter/`       | SQLite / PGlite / Supabase / sqliteai 适配器  | US-201~299 |
| `collaboration/` | 版本控制、撤销/重做、迁移协作                 | US-301~399 |
| `ui/`            | 代码编辑器等跨框架 UI 组件                    | US-401~499 |
| `plugin/`        | RxDB plugin 包（workspace / storage / graph） | US-501~599 |
| `future/`        | 中长期规划                                    | US-700~999 |

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

| 优先级 | 建议功能                             | 对应 story                                                               | 建议理由                                                                          | 主要交付边界                                                                         |
| :----: | ------------------------------------ | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
|   P0   | 跨 realm writer lease 与迁移 fencing | [US-304](stories/collaboration/US-304-writer-lease-migration-fencing.md) | 直接影响迁移期间的数据一致性；旧 writer 失效前不能允许发布类型系统升级            | lease/guard 表、drain barrier、epoch fencing、崩溃恢复、多进程/Worker 回归套件       |
|   P1   | 字段语义元数据与前端 DTO             | [US-012](stories/core/US-012-field-semantic-metadata.md)                 | 让生成器、三框架和 DevTools 使用同一份字段语义，避免按字段名猜测展示和校验规则    | `PropertyType + format` 契约、派生 `cardinality/source`、注册期聚合校验、版本化 DTO  |
|   P1   | Electron/Tauri 桌面本地数据库        | [US-207](stories/adapter/US-207-desktop-local-database.md)               | 补齐桌面端文件持久化和重启恢复，扩大 Local-first 的实际使用场景                   | Electron SQLite/PGlite host、Tauri SQLite、类型化 IPC、事务语义、真实文件 smoke test |
|   P2   | 持久化 Git 式工作区提交              | [US-305](stories/collaboration/US-305-persistent-workspace-commits.md)   | 旧暂存导出已在 `0.0.24` 删除，能力缺口现在完全敞开，但需要 US-304 的 fencing 打底 | 独立命名空间的新契约、commit 存储布局、跨 realm 校验复用 writer lease                |
|   P2   | PGlite 原生全文搜索                  | [US-703](stories/future/US-703-pglite-full-text-search.md)               | SQLite FTS5 已完成，PGlite 搜索缺口会造成适配器能力不对称                         | `tsvector/GIN/trigger`、存量回填、`tsquery` 排序/snippet/分页、三框架 parity         |

### 排期约束

1. 先完成 US-304，再允许涉及系统 schema 或 change codec 的新迁移进入发布分支。
2. US-012 可与 US-304 并行设计，但其 DTO 不得重新定义 `bigint/binary` 的值 wire codec。
3. US-207 必须先锁定 Electron IPC 和 Tauri 事务的真实连接语义；无法保证单连接事务时应 fail-fast，不得降级成伪事务。
4. US-305 必须排在 US-304 之后：其跨 realm 提交校验建立在 writer lease / epoch fencing 之上，不允许另起一套协调协议。
5. US-703 应复用现有搜索公开 API 和跨框架 parity fixture，不为 PGlite 增加 SQLite 专属 fallback。

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
- [状态概览](status-overview.md)
- [完成记录](CHANGELOG.md)
