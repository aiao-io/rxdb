# codex/supabase-update-cascade 分支评审（vs origin/main）

- **评审对象**：`codex/supabase-update-cascade`（tip `d73dbf6f`，PR [#170](https://github.com/aiao-io/rxdb/pull/170)，head 即本分支）
- **评审基点**：merge-base `06fdcb4b`（origin/main 上 #174 的提交）→ 分支 tip，即分支自身 3 个提交的净改动；merge 提交 `5d876167` 带入的 main 侧内容不计入
- **评审范围**：20 个文件，+1882 / −553。核心为 `docker/sql/02-rxdb-sync-functions.sql`、`docker/sql/04-rxdb-utils-functions.sql`、`packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts`、4 个 spec、SQL 安全回归套件、US-223 / US-224 两条 story 与配套文档
- **评审方式**：静态评审。逐行通读全部 diff 与三个核心文件的完整源码，交叉核对 story AC、SQL 回归断言与文档声明；未实跑测试（验证边界见文末）
- **评审日期**：2026-10-29

## 结论摘要

代码与 SQL 实现质量高：US-223（直写 UPDATE 语义 + 返回服务器最终行）与 US-224（级联删除日志）的设计自洽，键规范化、回执收口、幂等重试、事务设置恢复都有对应回归钉住，文档（README / 迁移页 / CHANGELOG）与实现一致。**可合并性的唯一实质障碍在 requirements 派生视图：merge 决议保留了分支侧基于旧 main（`7bb16a90`，早于 #168 / #174）的文档结构，合入会回退 main 的收敛成果，且 main 此后又改动了同一批文件，冲突必然发生。** 见 P1-1，必须在合并前重解析。

发现统计：**1 P1 + 3 P3 + 1 观察项**，无 P0、无 P2。

## 发现

### P1-1  requirements 派生视图与 main 分叉，merge 决议未采用 main 侧版本

**证据**：merge 提交 `5d876167` 的结果相对其第二父（main@`06fdcb4b`）在 6 个 requirements 文件上不等：

```
requirements/capability-matrix.md                  |  30 +-
requirements/epics/epic-004-future-features.md     |   9 +-
requirements/roadmap.md                            | 426 ++++++++++++++++-----
requirements/status-overview.md                    | 283 ++++++++------
requirements/stories/adapter/US-223-….md           |  76 +-
requirements/stories/adapter/US-224-….md           |  81 +-
```

分支基于 `7bb16a90`（早于 #168「收敛需求状态、验收范围和发布基线」与 #174「领域与公共包统一评审合并」），merge 时前 4 个派生视图整体保留了分支侧旧结构，`d73dbf6f`「refresh requirements derived views」又是在这份旧结构上刷新的数字。差异不只是两行状态行：main 侧的「现状快照」口径、「即办清单」、「排期约束 1～16」短格式、capability-matrix 中 US-220 的「UPDATE 按普通 UPDATE 落库」表述等，在分支版本中均被替换或删除。

**影响**：
- 分支以当前状态合入 main 时，roadmap.md / status-overview.md / capability-matrix.md / epic-004 会用分支侧内容覆盖 main 的 #168 / #174 收敛成果；
- main 在 merge 之后又改动了同一批文件（`ade2da5f` / `a808f770`：roadmap +65、status-overview +8、epic-004 +1），三方合并必然在这几个文件上产生冲突，按分支侧整体解冲突就会把 main 的内容一并回退；
- US-223 / US-224 两个 story 文件本身是分支的正当编辑（状态、AC、技术笔记），不在此列。

**处置**（合并前必须完成）：
1. 以**合并时点的 origin/main** 版本为底，重新套用本分支对 4 个派生视图的增量：roadmap 批次 3 中 US-223 / US-224 两行、epic-004「当前交付」段落、capability-matrix Supabase 行与需求覆盖列、status-overview 待评审表两行；
2. 数字一律用 `requirements --update` 回写（现状快照、In Review / Backlog 计数），不要手写；
3. 合入前跑 `audit:requirements` 与 `nx format:check` 复核。

### P3-1  无 userId 时直写 update 载荷原样透传 `createdBy`

`RxDBAdapterSupabase.utils.ts:74`（`data: userId ? data.map(...) : data`）：未配置 `context.userId` 时 `build_upsert_params` 不注入也不剥离审计字段，实体携带的 `createdBy` 会原样进入 `p_updates`，经普通 UPDATE 落库，可覆写原作者。有 userId 时 update 模式正确剥除 `createdBy` 并注入 `updatedBy`。

该函数本分支未改，但 `mutations-update-payload.spec.ts:86`「未设置身份时保持原实体的审计字段」首次把「无身份透传 createdBy」作为契约钉死。建议：与「未配置身份的直写是否应拒绝 / 至少剥除 createdBy」一并裁决；若维持现状，在 README 的直写事务一节补一句「未设置 userId 时审计字段按实体原样下发」。

### P3-2  同批内 UUID 大小写变体重复 → 未分类的 duplicate-key 错误

`04-rxdb-utils-functions.sql:930-937`：显式删除预登记 map 的键经 `(ARRAY[ids.value]::<id 类型>)[1]::text` 归一化，而完整性校验的 `duplicate_write`（`rxdb_assert_push_integrity` 规则 2）按**原始文本**比较。同一行以 `ABC…` 与 `abc…` 两种拼写出现在同一批 p_deletes 时：校验放行（文本不同），预登记 `jsonb_object_agg` 撞键，报未分类的 duplicate JSON object key 错误——整批仍回滚，但与 RX002 / 42501 的口径不符，难以诊断。

本分支对 uuid 大小写已覆盖「大小写拼写 → 触发器捕获合并 → 保留源映射」的正向链路（`test_cascade_uuid_keys`），只缺这个双重列出的负向。处置：可接受现状（病态输入、回滚无损），或让预登记按原始文本为键、捕获时再做一次大小写归一化比对；至少不值得为此改校验规则。

### P3-3  RLS 复现 spec 不再清理 `rxdb_change`

`mutations-update-rls-repro.spec.ts:93` 的 afterAll 只删业务夹具行（经 service_role，删除本身还会触发同步触发器写日志），旧版 beforeAll 的 `rxdb_change` 清场被移除。共享 dev / CI Supabase 库里 `rls_mutations_owner` / `rls_mutations_shared` 的日志会随每次运行累积。因实体名独立，不影响其它 spec 的断言，属测试卫生问题。建议 afterAll 里补一轮这两张表的 `rxdb_change` 清理（顺序：先业务行、后日志）。

### 观察项  直写路径的 DELETE 零行语义未判定（既有行为，非本分支引入）

`04-rxdb-utils-functions.sql:571` 起：`rxdb_mutations_apply_group` 的 DELETE 分支只在 `p_skip_sync = true`（推送）时对「少删的行」做 denied/gone 判定；直写（`p_skip_sync = false`）删除不存在的行静默成功，`mutations()` 仍返回被删实体。与 US-223 的 UPDATE 侧「RX001 / 42501 显式失败」口径不对称，但属 US-218 起冻结的既有语义、故事范围外，此处仅登记，不建议在本 PR 内扩大范围。

## 正面确认

实现与文档声明的对账，全部属实：

- **直写 UPDATE 走 `p_updates` + RETURNING**：适配器 `RxDBAdapterSupabase.ts:217-233` 拆出 `p_updates`；`rxdb_mutations_apply_group` 仅在 `p_skip_sync = false` 时经 `rxdb_batch_update_rows` 返回最终行并计入 `upserted`（04:556-561）；推送与原计数入口走无 RETURNING 的 `rxdb_batch_update`，权限与可见性语义不变。CHANGELOG / README / 迁移页三处表述与代码一致。
- **审计字段语义**：有 userId 时 update 剥 `createdBy`、注入 `updatedBy`（`RxDBAdapterSupabase.utils.ts:96-104`），AC#1 的「createdBy 不变」有正向断言。
- **级联删除捕获与日志顺序**：02 触发器（02:46-67）在 `rxdb.sync_enabled = false` 时把实际 DELETE 的完整 `OLD` 合并进事务级 GUC（显式行保留源键、隐式行 `entityKey` 为 NULL）；RPC 先按源顺序写客户端日志、再追加隐式 DELETE（04:1196-1220），`rxdb_insert_changes` 以 `ORDER BY ordinality` 保序落库（04:788-789）——「源 INSERT / UPDATE 在前、隐式 DELETE 在后」由 `test_cascade_source_order` 按 id 序断言。
- **键规范化设计自洽**：预登记 map 的**键**用 cast 归一化（uuid 大小写归一为小写），`entityKey` 字段保留原始拼写；触发器捕获键与归一化键对齐、合并进同一条目；回执修正与快照补齐按 `entityKey` 字段对齐源日志的 `rxdbEntityKey`。`test_cascade_uuid_keys` 的两段断言（重试无重复、拒绝后级联保留源回执键 + `beforeData.id = lower(entityId)`）与读码推演完全一致。
- **回执按实际删除收口**：显式子行先被拒、后被允许的父删除级联时，捕获条目使最终回执改判 `applied` 并清除拒绝原因（04:1186-1193）；`test_cascade_rejected_child` / `test_cascade_replay_and_rollback` 覆盖，含多级级联与失败组回滚（子事务 GUC 回滚语义正确）。
- **幂等重试**：`(clientId, localId)` 幂等键 + 全量已落库跳过业务写（04:1060-1120）保证重试不重复产生隐式日志；`test_cascade_explicit_deletes` 连推两次断言每条真实删除只记一次且保留源映射。
- **事务设置恢复**：入口保存、正常出口恢复 `rxdb.sync_enabled` / `rxdb.explicit_deletes`（04:916-917、1239-1240）；失败时靠事务回滚不泄漏，`test_cascade_explicit_deletes` 末段断言同事务下一次调用前已复原。
- **回归覆盖充分**：SQL 套件 30 → 36 个独立用例 + `all` 单事务组合，脚本 CASES 清单与 `project.json` 描述一致；两个新 spec 分别钉住载荷拆分 / 审计字段 / 空批次（`mutations-update-payload.spec.ts`）与双客户端拉取、混合批次不复活（`cascade-delete-sync.spec.ts`，本地只存普通 `parentId` 避免本地级联掩盖服务端漏记，设计正确）。
- **列权限边界**：`update_column_privileges` / `update_visibility_rows` 夹具 + 回归断言「计数入口不要求无关列 SELECT」「直写 RETURNING 强制列级 SELECT 与修改后行可见性并整批回滚」（`supabase-sql-security-regressions.sql:30-49` 建表、`test_update_visibility_transition`），与文档声明一致。
- **迁移指引**：02 / 04 同事务升级的中间窗口风险、新旧版本组合表（旧客户端 + 新 SQL 仍走 upsert、新客户端 + 旧 SQL 不能以调用成功证明已升级）在 CHANGELOG / README / 网站迁移页 / 两条 story 四处口径一致且诚实；`01-rxdb-system-tables.sql` 无变化、无需重跑。
- **安全边界诚实披露**：级联可删除调用方按 RLS 不可见的行、日志带完整 `OLD`、业务表 RLS 不构成日志逐行隔离——README「级联删除」一节与网站文档均明示，属既有触发器模式边界的延续，未扩大。
- **story 质量**：两条 story 症状锚定基提交 `7bb16a90`、AC 全 ✅ 并附验证记录、范围边界（不承诺 `save()` 合并服务器字段、不新增逐列脏追踪）与实现一致；引用的 PR #170 存在且 head 即本分支；`updated` 日期均已刷新。

## 与 origin/main 的关系

- 分支落后 origin/main 2 个提交：`ade2da5f`（跨 Tab 增量更新活查询修复）与 `a808f770`（Vue 实体详情异步就绪修复）。两者均不触碰本分支的代码文件（SQL / adapter / supabase 测试），代码面合并干净。
- 但这两个提交改动了 `requirements/roadmap.md`、`requirements/status-overview.md`、`requirements/epics/epic-004-future-features.md` 与 `requirements/reviews/README.md`——与 P1-1 叠加，文档冲突不可避免。

## 验证边界

- 本评审为**静态评审**，未实跑任何测试；「门禁通过、630 用例、36 SQL 用例、覆盖率 88.20% 分支覆盖」等数字取自两条 story 的验证记录，未在本评审中复核。
- 静态推演无法覆盖：真实 Supabase 上的 RLS / 触发器行为、`jsonb_object_agg` 撞键错误的确切 SQLSTATE、Realtime 回声路径的端到端表现。P1-1 重解析后建议按 `affected-ci` 跑一次完整门禁再合并。

## 建议处置顺序

1. 先处理 P1-1（以 main 为底重套 4 个派生视图的增量），再 rebase / merge 最新 main；
2. P3-1、P3-3 随手可带（一行文档 / 一轮清理）；P3-2 与观察项可判定不修并在对应位置留注释；
3. 其余实现无需改动，门禁复跑通过后即可进入评审合并流程。
