# 需求管理

这里维护 rxdb 的用户故事、史诗和状态总览。这个目录不是“想法回收站”，而是当前实现范围、优先级和完成状态的业务入口。

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
| `tooling/`       | 门禁、基线与发布工具链（不是产品能力）                      | US-601~699 |
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
|   P1   | Electron 桌面本地 SQLite             | [US-207](stories/adapter/US-207-desktop-local-database.md)               | 补齐桌面端文件持久化和重启恢复，扩大 Local-first 的实际使用场景                       | Electron **SQLite 文件**路径、共享桌面 host 契约、类型化 IPC、真实文件 smoke test                                  |
|   P2   | 提交图与 HEAD 持久化                 | [US-305](stories/collaboration/US-305-commit-graph-head.md)              | 旧暂存导出已在 `0.0.24` 删除，能力缺口现在完全敞开，但需要 US-304 的 fencing 打底     | 独立命名空间的新契约、commit 存储布局、baseline commit 与一次性迁移                                                |
|   P2   | 字段值校验与生成器透传               | [US-012c](stories/core/US-012c-field-value-validation-codegen.md)        | 有了 DTO 才谈得上运行时校验；单独成条以免和 DTO 一起变成不可验收的大块                | `validateFieldValue()`、D12 归一化、生成器透传、三框架 fixture 复用                                                |
|   P2   | Electron PGlite 数据目录与事务宿主   | [US-208](stories/adapter/US-208-electron-pglite-data-directory.md)       | PGlite callback transaction 不能跨 IPC 序列化，需要 SQLite 路径不需要的事务 host 协议 | 主进程 data directory、事务 ID 协议或主进程托管 adapter、跨进程类型保真                                            |
|   P2   | PGlite 原生全文搜索                  | [US-703](stories/future/US-703-pglite-full-text-search.md)               | SQLite FTS5 已完成，PGlite 搜索缺口会造成适配器能力不对称                             | `tsvector/GIN/trigger`、存量回填、`tsquery` 排序/snippet/分页、三框架 parity                                       |
|   P2   | 子路径入口纳入 API 表面基线          | [US-601](stories/tooling/US-601-subpath-api-surface-baseline.md)         | 版本策略把子路径承诺为公开 API，门禁却只扫主入口——承诺与门禁的差额只能靠人工审查补    | 源入口声明收敛到单一真相源、基线格式扩到多入口、资产入口白名单跳过、三处文档收口                                   |

> US-306 / US-307 / US-308 不在本表单列——它们是 US-305 的后续交付，排期跟随
> [epic-006](epics/epic-006-working-tree-commits.md) 内部的固定依赖关系。

### 排期约束

1. 先完成 US-304，再允许涉及系统 schema 或 change codec 的新迁移进入发布分支。
2. US-012 系列可与 US-304 并行设计，但其 DTO 不得重新定义 `bigint/binary` 的值 wire codec。
   系列内部必须按 **US-012a → US-012b → US-012c** 顺序交付；`US-012` 本体自 2026-08-13 起降级为共享契约文档，不直接交付。
3. US-207 必须先锁定 Electron SQLite 的真实连接语义并抽出共享桌面 host 契约；无法保证单连接事务时应 fail-fast，不得降级成伪事务。
4. US-208 与 US-210 均排在 US-207 之后，复用其抽出的 host 契约。US-208 的两种事务 host 方案（IPC 事务 ID 协议 /
   adapter 完整托管在主进程）、US-210 的两种事务方案（配置单连接池 / Rust command 持有事务）都必须先通过同一套事务与事件测试再冻结选择。
5. US-305 必须排在 US-304 之后：写事务复用 writer 身份与迁移期 epoch fencing，普通提交竞争使用独立的
   `headRevision` CAS，不把 epoch 当业务版本。epic-006 内部顺序为 **US-305 → US-306 → (US-307 ∥ US-308)**；
   US-305/306 先交付数据安全原语，US-307/308 再并行交付恢复与分支/冲突用户面。
6. US-703 应复用现有搜索公开 API 和跨框架 parity fixture，不为 PGlite 增加 SQLite 专属 fallback。
7. ~~US-209 只做门禁与文档收尾~~ → 2026-08-15 已 Done。约束仍然生效并转为**长期口径**：小程序适配器的能力承诺不得扩大，
   WAL、多页面并发、崩溃恢复保证和微信以外的小程序平台都不在范围内；文档一律写「实验性」，
   不得把它列成与 wa-sqlite 同级的受支持适配器（落点见 [compatibility.md](../website/docs/compatibility.md) 的能力边界专节）。
   US-209 AC#8 顺带留下一个新缺口：`exports` 子路径入口的**导出表面**不受 api-surface 门禁保护
   （清单本身已由 `KNOWN_UNCOVERED_SUBPATHS` 核对），见
   [status-overview.md](status-overview.md) 的「已知的需求覆盖缺口」。
   该缺口 2026-08-15 由 [US-601](stories/tooling/US-601-subpath-api-surface-baseline.md) 认领；
   在它交付之前，改动这 12 个子路径入口的导出**必须在 PR 描述里人工声明破坏性**。

### 建议补充的验收维度

- **故障恢复**：迁移者、writer、桌面 host 或搜索索引初始化中途崩溃后，重试结果必须可预测且不可产生半状态。
- **能力矩阵**：SQLite family、PGlite、Electron、Tauri、Angular、React、Vue 的支持/不支持组合必须在 story 和公开文档中显式列出。
- **发布门禁**：新增公开 API 同步更新 API baseline、TSDoc、覆盖率门禁和跨框架 parity 测试。
- **可观测性**：连接、迁移、fencing、索引回填失败应提供稳定错误码和可诊断上下文，不静默回退到 memory、OPFS 或 IndexedDB。

### 开项：0.0.25 遗留的两条版本漂移（2026-08-15 发现，源码已修，**已发布产物无法修**）

两条都源自 0.0.25 的版本 bump 只改了 `package.json`，一度让 `pnpm test-all` 变红：

- `packages/rxdb/src/version.ts` 的 `RXDB_VERSION` 停在 `'0.0.24'`——
  **已发布的 `@aiao/rxdb@0.0.25` 在报假版本**；
- `packages/code-editor-angular` 的 peer `"@aiao/code-editor": ">=0.0.24"` 下界低于工作区版本。

两条各自都已有断言在守，**断言没坏，是没人跑绿就发了版**。源码已改、两个 project 恢复全绿；
但 npm 上的 0.0.25 产物改不了，`rxdb.version` 报错版本这件事要写进 0.0.26 的 release note。

发布改为手工执行后，这类漂移没有自动门禁兜底——**手工发布前必须先跑绿 `pnpm test-all`**。

## 下一次发布计划（桥接版本）

[US-304](stories/collaboration/US-304-writer-lease-migration-fencing.md) 的 AC1/AC11 卡在「本仓库没有任何 tag 被声明为桥接版本」。
决策已定：**另打一个新 tag 作为桥接版本，不追认 `v0.0.24`**。本节固化发布顺序与关闭判据。
版本号由 `nx release` 按 conventional commits 计算得出（见下方硬前提 2）。本节写作时 `0.0.25` 只是占位；
**实际算出来也是 `0.0.25`**（2026-08-13 执行，理由见[执行记录](#执行记录2026-08-13)——是 `fix:` 而非 `feat:` 撑起来的 patch）。

整体是四段，**顺序不可交换**：

| 段  | 动作                                                                            | 为什么必须在这个位置                                                                        |
| --- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | 交付 [US-207](stories/adapter/US-207-desktop-local-database.md) 桌面本地 SQLite | 没有可 bump 的提交就发不出版本（见现状实测末行）；且它是纯适配器路径，不会污染桥接版本      |
| 2   | 合入 `main`                                                                     | tag 必须打在 `main` 上，本仓库一律 squash——先打 tag 再 squash 会让 tag 提交脱离 `main` 历史 |
| 3   | 打桥接 tag 发布                                                                 | 桥接 tag 只有存在于 `main` 祖先链上，将来的 migration 发布才引用得了                        |
| 4   | 验证并修复迁移 fencing                                                          | AC11 的门禁三钩子（tag 存在/是祖先/含协议）在没有真实桥接 tag 之前只能靠桩，验不了          |

**选 US-207 而不是 US-305**：US-305 的范围含「已有数据库的一次性初始化」，属 schema 迁移，会强制
`kind=migration`，而 migration 要求 `bridge.tag` 指向一个**已存在**的桥接发布——现在没有，直接死锁。
US-207 是纯适配器/桌面路径，不动系统版本常量，能干净地落成桥接锚点。US-305 是第 4 段之后
那次 migration 发布的内容。

### 现状实测（2026-08-13）

| 事实                                                                                                             | 实测                                                                                          | 影响                                                                                  |
| ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| HEAD 与 `v0.0.24` 的 `RXDB_SYSTEM_SCHEMA_VERSION` / `RXDB_WRITER_PROTOCOL_VERSION` / `RXDB_CHANGE_CODEC_VERSION` | 均为 `3` / `1` / `1`，两侧完全相同                                                            | 下一版**不升级任何系统版本**，只能是 `kind=bridge`，够不着 `migration`                |
| `v0.0.24` 的清单                                                                                                 | `kind=bridge`、`release.version=0.0.25`，而同 tag 的 `packages/rxdb/package.json` 是 `0.0.24` | 版本漂移；门禁在该 tag 上只报一条 `release.version 0.0.25 does not match tag v0.0.24` |
| `v0.0.24` 的 `publish.yml`                                                                                       | 门禁两步已经排在 build / `nx release publish` 之前                                            | 门禁不是「没装」，是没在真实发布路径上跑过                                            |
| `v0.0.24` tag                                                                                                    | 已推送 origin、是 HEAD 祖先，指向提交 `init`                                                  | 本仓库是重新初始化的历史；npm 上的 `0.0.24` 不是经这条流水线发出来的                  |
| 门禁的触发面                                                                                                     | PR CI 的 `setup` job 跑 `pnpm test-scripts`，已含清单 ↔ 包版本的绑定校验                      | 漂移**已经**能在 PR 上发现；仅 `bridgeTag*` 三个 git 钩子还只在 tag 时跑              |
| 仓库的合并方式                                                                                                   | 全历史零 merge commit，PR #2–#5 均为 squash                                                   | tag 必须打在 main 上；打在特性分支再 squash 会让 tag 提交脱离 main 历史               |
| `v0.0.24..HEAD` 的 11 个提交                                                                                     | 7 个非规范（`123` / `up`，nx 解析不到），4 个是 `chore` / `docs` → `semverBump: 'none'`       | **当前可 bump 量为零**，此刻跑 `nx release version` 算不出新版本                      |

### 两条硬前提

先说两件会让整个计划作废的事，动手前必须确认：

1. **桥接版本不得抬升系统版本常量**。`bridge` 的定义就是「发布了 writer lease 协议、但不改
   schema/codec，让所有实例先升到它」；门禁对 `kind=bridge` + `systemSchemaUpgrade|changeCodecUpgrade=true`
   直接报 `bridge releases cannot upgrade system schema or change codec`。所以随这一版发布的功能
   **不能动** `RXDB_SYSTEM_SCHEMA_VERSION` / `RXDB_CHANGE_CODEC_VERSION`。若那个功能必须升 schema，
   它得排到桥接版本**之后**单独发——否则就会掉进「migration 需要先有 bridge tag，而 bridge tag 又被这次升级污染」的死锁。
2. **版本号是算出来的，不是选的**。`conventionalCommits: true` 且 `nx.json` 未自定义类型映射，
   走 nx 23.1.1 的 `DEFAULT_CONVENTIONAL_COMMITS_CONFIG`：**只有 `feat:` → minor、`fix:` → patch，
   其余全部 `none`**（`perf` / `refactor` / `docs` / `build` / `types` / `chore` / `examples` / `test` / `style`）。
   两个推论：

   - 当前 `v0.0.24..HEAD` 一个可 bump 的提交都没有，**不落功能就发不出版本**——这正是本计划把
     US-207 排在发布之前的硬原因，不是排期偏好。
   - US-207 以 `feat:` 落地会算出 **`0.1.0`** 而非 `0.0.25`。桥接版本号本身叫什么无所谓
     （后续 migration 的 `bridge.version` 照抄即可）；若坚持 `0.0.25`，需显式传版本号覆盖推算结果。
     无论取哪个，清单、tag、`packages/rxdb/package.json` 三处必须同为那个实际值——本节写 `0.0.25` 只是占位。

### 执行顺序

0. **补齐门禁的 git 钩子面**（不依赖发布，可立即做）：PR CI 的 `setup` job 已经通过 `pnpm test-scripts`
   校验签入清单的结构与「清单 ↔ `packages/rxdb/package.json` 版本一致」，`v0.0.24` 那类漂移现在拦得住。
   仍缺的是 `bridgeTagExists` / `bridgeTagIsAncestor` / `bridgeTagSupportsProtocol` ——单测里它们被
   `passingHooks` 桩掉了。把 `migration-release-gate`（不带 `--release-tag`）挂进 PR CI 才能用真实 git 校验。
   这三条只对 `kind=migration` 生效，本次桥接发布用不上，但下一个迁移周期会用上。
1. **交付 US-207 并合入 `main`，再打 tag**——顺序不能反。落地时两条约束：提交必须是规范的
   `feat(...)`（否则 bump 量仍为零，发不出版本），且**不得改动** `RXDB_SYSTEM_SCHEMA_VERSION` /
   `RXDB_CHANGE_CODEC_VERSION`（否则 `kind=bridge` 过不了门禁）。US-207 是纯适配器路径，天然满足后者。
   门禁的祖先判定是
   `git merge-base --is-ancestor <tag>^{commit} HEAD`（[scripts/check-migration-release-gate.mjs:186](../scripts/check-migration-release-gate.mjs#L186)）。
   本仓库全历史零 merge commit，PR 一律 squash：若在特性分支上打 tag 再 squash 进 `main`，
   tag 指向的提交**不在** `main` 的历史里，将来那次 migration 发布会卡在
   `bridge.tag ... is not an ancestor of the release commit`，且无法在不重写 tag 的前提下补救。
   `v0.0.24` 现在能过祖先判定，纯粹因为它指向根提交 `init`——那是巧合，不是可复用的模式。
2. **先 version，后改清单，再一起提交**——顺序同样不能反。`nx release` 会自己算版本号、改写
   `packages/*/package.json`、提交并按 `v{version}` 打 tag；清单是手工维护的，不在它的改写范围内，
   所以必须卡在「版本已定、tag 未打」之间更新：

   ```bash
   pnpm nx release version --git-commit=false --git-tag=false   # 只改 package.json，不提交不打 tag
   # 读 packages/rxdb/package.json 的 version，据此更新清单
   ```

   `v0.0.24` 就是栽在这一步：包版本停在 `0.0.24`，清单已经写成 `0.0.25`，两者从未对齐。

3. **更新清单**：`requirements/migration-release.json` 由 `kind=normal` 改为 `kind=bridge`，
   `release.version` 填上一步实际得到的版本号。`bridge.tag` / `bridge.version` 保持 `null`——
   桥接版本不引用桥接 tag，只有 migration 版本才填。
4. **本地预检**：`pnpm nx run @aiao/source:migration-release-gate-test` 与
   `pnpm nx run @aiao/source:migration-release-gate --args="--release-tag=v<实际版本>"` 全绿后才允许提交。
5. **提交并打 tag 推送**：package.json 与清单在同一个提交里，tag 指向 `main` 上的该提交。
   推送 tag 不会触发任何发布——发布是手工执行 `pnpm publish`，由执行者自行确保第 4 步已跑绿。
6. **回写 US-304**：AC1 由 ⚠️ 转 ✅，依据是「桥接 tag 已推送、是 `main` 祖先、清单声明 `kind=bridge` 且通过门禁」。
   AC6 **不随第 1 段转 ✅**：US-207 AC#5 交付的是两个**同时在线**的 writer 在连接时互相 fencing，
   AC#1 的重启 e2e 两次启动之间不发生迁移；而 AC6 要的是「writer 挂起 → 别的 realm 完成迁移抬 epoch
   → 该 writer 恢复后写入被 fence」。三者不是同一个场景。此后 US-304 仍剩 AC6 与 AC11。

### 执行记录（2026-08-13）

第 1–4 段均已执行，**但停在推送之前**：tag 只存在于本地。

| 段  | 结果                                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------- |
| 1   | US-207 交付完成，AC#1 / #3–#7 ✅（详见该 story）                                                          |
| 2   | `next-0813` 以 fast-forward 并入 `main`（14 个提交、153 个文件），零 merge commit，符合本节对祖先链的要求 |
| 3   | 版本 `0.0.25`，清单切 `kind=bridge`，本地 tag `v0.0.25` 已打；**未推送**                                  |
| 4   | 门禁三个 git 钩子首次用真实 tag 验证（下方「门禁三钩子的实测」）                                          |

两处与本节原有预期不符，记录如下：

- **版本号算出来是 `0.0.25` 而不是 `0.1.0`**。上文硬前提 2 预计「US-207 以 `feat:` 落地会算出 `0.1.0`」，
  实际落地的 14 个提交里**一条 `feat:` 都没有**（US-207 连同新包 `@aiao/rxdb-adapter-desktop` 是以
  `123` / `up` 一类非规范信息提交的），可 bump 的只有 2 条 `fix:` → patch。
  所以 `0.0.25` 是 `nx release version` 真算出来的值，未做人工覆写，与本节此前的占位值恰好相同。
  需要认清的是：**这个 patch 反映的是提交信息的形态，不是这次改动的份量**——
  一个全新可发布包以 patch 发出去，changelog 上看不出来。
- **「当前可 bump 量为零」一行已过期**（现状实测表末行）。第 1 段落地后不再为零，
  这正是把 US-207 排在发布之前的那个硬原因兑现的地方。

### 门禁三钩子的实测（2026-08-13）

第 4 段要验的是「`bridgeTagExists` / `bridgeTagIsAncestor` / `bridgeTagSupportsProtocol`
在没有真实桥接 tag 之前只能靠桩」。`v0.0.25` 打出来之后，用一份临时 `kind=migration` 清单
（不动签入的那份）做了正反两组对照：

| 清单的 `bridge.tag` | 三条 git 钩子的报错 | 结论               |
| ------------------- | ------------------- | ------------------ |
| `v0.0.25`（真 tag） | **一条都没有**      | 三个钩子首次真跑通 |
| `v9.9.9`（不存在）  | 三条**全部**报出    | fail-closed 成立   |

正向那组剩下的三条报错都是对的：`release.version 0.0.26` 与包版本不符（临时清单自己编的版本）、
`oldBundlePolicy.strategy` 不在白名单（临时清单把 `force-update` 写成了 `forced-update`，
顺带证明白名单有效）、以及 `migration releases must upgrade system schema or change codec`——
最后这条正是下文所说的真实阻塞。

**门禁本身不需要修**：它在真实 tag 上的行为与桩一致，且对伪造 tag 正确拒绝。

### AC11 不随本次发布关闭

AC11 的操作列是「发布迁移版本」，而 `0.0.25` 不升级任何系统版本，够不着这个前置条件。三条子句在发布后的状态：

| 子句                                                 | `v0.0.25` 之后                         |
| ---------------------------------------------------- | -------------------------------------- |
| 本仓库须存在位于 HEAD 祖先链上的桥接 tag             | ✅ 本次桥接 tag                        |
| 发布门禁阻止升级，或强制更新/缓存失效/新命名空间隔离 | ❌ 需要一次真实 migration 发布才验得了 |
| 不得声称 AC13 已完成                                 | ✅ 保持                                |

真正关闭 AC11 的那次发布必须同时满足：抬升 `RXDB_SYSTEM_SCHEMA_VERSION` 或 `RXDB_CHANGE_CODEC_VERSION`、
清单切 `kind=migration`、`bridge.tag` / `bridge.version` 指向本次桥接版本、`oldBundlePolicy.strategy` 四选一、
`minimumVersion` 不低于桥接版本、`enforced=true`。

按现有排期，第一个带迁移的交付是 [US-305](stories/collaboration/US-305-commit-graph-head.md)（其范围含「每分支 baseline commit 与一次性迁移」）。
**2026-08-15 已决策转移**：AC11 挂到 US-305 的 `inherited_acs`，US-304 只对桥接协议和迁移 fencing
本身负责。这样 US-304 可以在补齐 AC6 后 Done，US-305 随后用首个真实迁移发布验收
`bridge.tag=v0.0.25`、`oldBundlePolicy` 和 migration release gate，不再形成循环依赖。

（AC6 同样不在此列，但理由不同：它不需要转移，只缺一条自己的用例——
「writer 挂起 → 别的 realm 完成迁移抬 epoch → 该 writer 恢复后写入被 fence」。
US-207 的两条用例都不是这个场景，见上文第 6 步。）

不要用「推一个废弃 tag」来充当 AC11 的证据：tag 是桥接协议的声明本身，
试探性 tag 会污染 `nx release` 的版本计算基准，也会让后续读历史的人分不清哪个 tag 是真的。

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
- [公开 API 门禁](epics/epic-007-public-api-gates.md)
- [状态概览](status-overview.md)
- [完成记录](CHANGELOG.md)
