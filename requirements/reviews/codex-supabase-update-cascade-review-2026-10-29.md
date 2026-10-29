# codex/supabase-update-cascade 分支评审

评审日期：2026-10-29。结论：**🔴 不通过，建议修复后再合入；剩余 4 项：1 P1、3 P2。**

## 基线与范围

- 目标分支：`codex/supabase-update-cascade`，评审提交 `d73dbf6f4dd798060dfd2d5747bbf30408d2f656`。
- 已执行 `git fetch origin`；主线：`origin/main` @ `a808f770f08173657ac4c82d752da1d4179345b6`。
- 公共祖先：`06fdcb4b0a9413e9934708f258e6e61fc23d2f51`。逐文件审查 `git diff origin/main...d73dbf6f`，共 20 个文件，新增 1882 行、删除 553 行，包含生产代码、SQL、测试、配置和全部文档。
- 分支有 4 个主线外提交；主线另有 #167、#169 两个修复提交尚未进入本分支。已核对两端直接差异的文件清单；这些主线新增修复不计作本分支主动删除。合入时仍需验证与最新主线的组合。
- 本报告只评审并记录问题，未修改业务代码。整分支报告按本目录约定不占 RV 编号。

## F-01 · P1 · 隐藏显式子行的 DELETE 被误标为完整快照，Filter Sync 漏删

**位置**：[`rxdb_mutations`](../../docker/sql/04-rxdb-utils-functions.sql) 的最终 DELETE 快照补齐，评审提交第 1197～1204 行：

```sql
CASE WHEN COALESCE(c->>'branchId', 'main') = 'main' AND c->>'type' = 'DELETE'
  AND NOT (c->>'snapshotComplete')::boolean
```

**触发与结果**：子行被 RLS 隐藏，同批先显式删除子行，再删除允许操作的父行。子行的显式删除先被拒绝，随后实际被外键级联删除；新增逻辑将其最终回执改为 `applied`。但常规 DELETE 的 `inversePatch` 非空且不含 `id`，规范化阶段已经仅凭其非空将 `snapshotComplete` 置为 true，以上条件便跳过已捕获的真实 `OLD`。

这不是人为构造的残缺协议：[核心 `RxDBChange.inversePatch`](../../packages/rxdb/src/system/change.ts) 明确规定 DELETE 只含除 id 外的完整旧字段；[`build_merge_changes_payload`](../../packages/rxdb-adapter-supabase/src/supabase.merge-changes.ts) 直接下发 `inversePatch: change.inversePatch ?? null`，不会补 id。

PostgreSQL 17 实测：子行回执为 `applied`，日志为 `beforeData={"parent_id":"p","value":"real-value"}`、`snapshotComplete=true`；[`rxdb_pull_changes`](../../docker/sql/02-rxdb-sync-functions.sql) 按 `id = 'c'` 过滤返回 **0 条 DELETE**。订阅该条件且此前持有子行的客户端会留下幽灵数据。`origin/main` 在此场景原来返回子行 `rejected` 且不写其源日志；本项是本次新增的回执修正与快照补齐路径未完成 US-224 AC#6，不能声称主线原来同步正常。

**修复建议**：区分从服务端可见行取得的快照与仅由客户端 inversePatch 拼出的快照。对实际捕获了 `OLD` 的最终显式 DELETE，使用真实 `OLD` 补齐，保留源 `clientId/localId` 与日志顺序。补回归时必须带常规 inversePatch，并断言 id 过滤能拉到 DELETE；现有 [`push_cascade_deletes` / `test_cascade_rejected_child`](../../packages/rxdb-adapter-supabase/src/__tests__/supabase-sql-security-regressions.sql) 没传 inversePatch，恰好走了能补齐的分支。

**最小复验**：在已安装本分支参考 SQL 的隔离数据库执行；事务末尾回滚。

```sql
BEGIN;
CREATE SCHEMA review_cascade;
CREATE TABLE review_cascade.parents (id text PRIMARY KEY, value text);
CREATE TABLE review_cascade.children (
  id text PRIMARY KEY,
  parent_id text REFERENCES review_cascade.parents ON DELETE CASCADE,
  value text
);
SELECT public.rxdb_enable_sync_for_table('parents', 'review_cascade', 'Parent');
SELECT public.rxdb_enable_sync_for_table('children', 'review_cascade', 'Child');
INSERT INTO review_cascade.parents VALUES ('p', 'parent');
INSERT INTO review_cascade.children VALUES ('c', 'p', 'real-value');
ALTER TABLE review_cascade.children ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA review_cascade TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA review_cascade TO anon;
SET LOCAL ROLE anon;
SELECT public.rxdb_mutations(
  p_deletes => '[
    {"schema":"review_cascade","table":"children","ids":["c"]},
    {"schema":"review_cascade","table":"parents","ids":["p"]}]',
  p_changes => '[
    {"namespace":"review_cascade","entity":"Child","schema":"review_cascade",
     "table":"children","entityId":"c","type":"DELETE",
     "inversePatch":{"parent_id":"p","value":"real-value"},
     "branchId":"main","clientId":"review-cascade","localId":1},
    {"namespace":"review_cascade","entity":"Parent","schema":"review_cascade",
     "table":"parents","entityId":"p","type":"DELETE",
     "inversePatch":{"value":"parent"},
     "branchId":"main","clientId":"review-cascade","localId":2}]',
  p_skip_sync => true, p_receipts => true
);
SELECT "entityId", "beforeData", "snapshotComplete"
FROM public.rxdb_change WHERE "clientId" = 'review-cascade';
SELECT count(*) AS filtered_delete_count
FROM public.rxdb_pull_changes(
  0, 100, 'review_cascade', 'Child', 'main',
  '{"combinator":"and","rules":[{"field":"id","operator":"=","value":"c"}]}'
) WHERE type = 'DELETE';
-- 实际为 0，期望为 1。
ROLLBACK;
```

## F-02 · P2 · 数值主键的规范化丢失列精度，同一显式删除又生成隐式日志

**位置**：[`rxdb_mutations`](../../docker/sql/04-rxdb-utils-functions.sql) 构造显式删除上下文，评审提交第 931 行：`(ARRAY[ids.value]::%s)[1]::text`；`%s` 来自 `rxdb_id_array_type`。

**触发与结果**：业务主键是 `numeric(8,2)`、值为 1，客户端发送 id 文本 `"1"`。数组 regtype 只有 `numeric[]`，不携带列的精度与小数位修饰信息，显式上下文键登记为 `"1"`；触发器的 `OLD.id::text` 为 `"1.00"`。两者不匹配，实际显式删除被再次当作隐式删除追加。

PostgreSQL 17 实测单次删除 `changes=2`：源日志 `entityId="1"`，另有 `clientId/localId=NULL` 的隐式日志 `entityId="1.00"`。`origin/main` 同载荷只写 1 条。这违反显式删除去重，且把同一主键用两个文本身份写进同步流。`rxdb_id_array_type` 未排除该类型，按等值比较删除本来能够成功。

**修复建议**：上下文键必须与实际列值的表示一致。保留列类型修饰信息，或按真实行与输入 id 的类型等值关系登记映射；不能仅按数组基础 regtype 转文本。增加 `numeric(8,2)`、输入 `"1"` 与存储表示 `1.00` 的回归。

## F-03 · P2 · 分区表按叶分区名查上下文，显式删除重复记日志

**位置**：[`rxdb_log_change_trigger`](../../docker/sql/02-rxdb-sync-functions.sql)，评审提交第 56 行：

```sql
v_entity_key := pg_catalog.jsonb_build_array(TG_TABLE_SCHEMA, TG_TABLE_NAME, OLD.id::text)::text;
```

**触发与结果**：在分区根表启用同步，客户端也通过根表提交删除；PostgreSQL 将行级同步触发器克隆到叶分区，执行时 `TG_TABLE_NAME` 是叶分区名。RPC 的上下文按根表名登记，触发器按叶分区名查询，无法识别已登记的显式删除，继而追加隐式日志。

PostgreSQL 17 实测只删除一行，`changes=2`，同 namespace/entity/entityId 出现源 DELETE 与 server-origin DELETE 各一条；`origin/main` 为 1 条。推送端因此还会拉到本应去重的删除回声。参考 SQL 的 `rxdb_id_array_type` 和 `rxdb_existing_ids` 明确接受 `relkind IN ('r', 'p')`，不能把已接受的分区根表默认为不支持。

**修复建议**：将叶分区捕获映射回本次请求使用的源关系，统一显式与实际删除的关系身份；补根表注册同步、通过根表删行、单条源日志与映射不变的回归。

**F-02 / F-03 的共同复验**：在参考 SQL 数据库执行以下脚本。第一个 RPC 和第二个 RPC 均应只产生 1 条 DELETE，当前各产生 2 条。

```sql
BEGIN;
CREATE SCHEMA review_keys;
CREATE TABLE review_keys.numeric_ids (id numeric(8,2) PRIMARY KEY, value text);
SELECT public.rxdb_enable_sync_for_table('numeric_ids', 'review_keys', 'NumericEntity');
INSERT INTO review_keys.numeric_ids VALUES (1, 'first');
SELECT public.rxdb_mutations(
  p_deletes => '[{"schema":"review_keys","table":"numeric_ids","ids":["1"]}]',
  p_changes => '[{"namespace":"review_keys","entity":"NumericEntity",
    "schema":"review_keys","table":"numeric_ids","entityId":"1","type":"DELETE",
    "inversePatch":{"value":"first"},"branchId":"main",
    "clientId":"review-numeric","localId":1}]',
  p_skip_sync => true, p_receipts => true
);
SELECT "entityId", "clientId", "beforeData", "snapshotComplete"
FROM public.rxdb_change WHERE namespace = 'review_keys' AND type = 'DELETE';

CREATE TABLE review_keys.partition_ids (
  id integer, value text, PRIMARY KEY (id)
) PARTITION BY RANGE (id);
CREATE TABLE review_keys.partition_ids_low
  PARTITION OF review_keys.partition_ids FOR VALUES FROM (0) TO (100);
SELECT public.rxdb_enable_sync_for_table('partition_ids', 'review_keys', 'PartitionEntity');
INSERT INTO review_keys.partition_ids VALUES (1, 'first');
SELECT public.rxdb_mutations(
  p_deletes => '[{"schema":"review_keys","table":"partition_ids","ids":["1"]}]',
  p_changes => '[{"namespace":"review_keys","entity":"PartitionEntity",
    "schema":"review_keys","table":"partition_ids","entityId":"1","type":"DELETE",
    "inversePatch":{"value":"first"},"branchId":"main",
    "clientId":"review-partition","localId":1}]',
  p_skip_sync => true, p_receipts => true
);
SELECT "entityId", "clientId", "beforeData", "snapshotComplete"
FROM public.rxdb_change
WHERE namespace = 'review_keys' AND entity = 'PartitionEntity' AND type = 'DELETE';
ROLLBACK;
```

## F-04 · P2 · 派生文档回退验收与准入结论，掩盖尚未完成的发布消费验证

**位置**：[`roadmap` 的批次 5 表](../roadmap.md)，评审提交第 109 行把 US-528 写成 `AC#1～3 全 ✅`；[`status-overview` 的待评审表](../status-overview.md) 中 US-528 只剩“消费应用与 e2e 已通过，接入成本记录已交付，待评审”。

**证据与影响**：未修改的 [US-528 验收标准与技术笔记](../stories/domain/US-528-admin-consumer-example.md) 仍将 AC#1、#3 标为 ⚠️，明确“发布 tarball 的隔离安装尚未覆盖”“AC#1 / #3 因此待验证”。公共祖先的汇总已正确保留该缺口，本分支将 workspace e2e 扩写成全部验收通过，发布或收尾时会漏掉仓外安装和试用者独立重搭。

同一批派生内容还有直接矛盾：roadmap 的“立项池”又把 epic-010 写成“未解锁、价值待证”，但该文件“批次 5”及未修改的 [epic-010 解锁记录](../epics/epic-010-model-driven-admin-framework.md) 均明确 owner 已解锁。US-910 的阻塞摘要也回退为缺 Full/Filter/tombstone 夹具，未反映 [US-910 阶段 0](../stories/future/US-910-data-i18n.md) 当前的公开启停、删除证据与合并扩展点验证要求。

**修复建议**：以故事 YAML、AC 和当前解锁记录逐项核对派生视图；本次仅更新 US-223/224 及相应计数，保留已存在的其他范围与验收缺口。复验时对照 US-528 AC#1/#3、epic-010 的解锁结论和 US-910 阶段 0，不能只校验状态数量。

## 已执行验证与限制

本次使用当前 checkout 专属 Supabase CI 栈（PostgreSQL 17.6），没有改动其他任务的数据库。F-01～F-03 的 SQL 在该栈实测，并在事务内装载 `origin/main` 的 02 / 04 后执行同载荷对照；全部诊断以回滚结束。另有隔离 PostgreSQL 16 复验得到相同结果。

| 验证                                                                                          | 本次结果                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm nx run rxdb-adapter-supabase:sql-security-regressions --output-style=static`            | 36 个独立用例及 `all` 单事务组合全部通过；现有套件没有覆盖上述 3 个反例                                                                                                       |
| `pnpm nx run rxdb-adapter-supabase:test --coverage=false --output-style=static --skipNxCache` | 43 个 spec、630 个用例全部通过，包括 UPDATE / RLS 和两客户端级联删除                                                                                                          |
| `pnpm nx run rxdb-adapter-supabase:lint --max-warnings=0 --output-style=static`               | 通过                                                                                                                                                                          |
| `pnpm nx run rxdb-adapter-supabase:typecheck --output-style=static`                           | 通过，所需 build 与依赖 typecheck 通过                                                                                                                                        |
| 默认启用覆盖率的同一 `test` 目标                                                              | 两次均被 `Failed to fetch dynamically imported module: …/@id/@vitest/coverage-v8/browser?import` 中断；本次未取得有效覆盖率数据，不能用 0% 输出或故事中的旧数值判定当前覆盖率 |
| 三端 API 影响                                                                                 | 已读 `rxdb-{angular,react,vue}/src/index.ts` 与适配器入口；本分支未新增或改动框架入口、共享类型签名，无本次新增的单端缺失                                                     |

没有重跑整个 `pnpm test-all`、应用 e2e 或实际升级演练；故事中已有的这些验证记录属于分支先前证据，不充作本次重新执行的结果。默认覆盖率运行失败是本次验证限制，尚未归因为本分支生产代码缺陷。

## 完整差异覆盖

以下列出 `origin/main...d73dbf6f` 的全部 20 个文件。路径以仓库根目录为基准；结论基于实际源码、调用链与测试断言，未仅按文件名判断。

| 文件                                                                                                                                                                                      | 核查内容与结论                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `docker/sql/02-rxdb-sync-functions.sql`、`docker/sql/04-rxdb-utils-functions.sql`                                                                                                         | UPDATE 返回行与计数分离、RLS、拒绝/消失、源日志顺序、级联捕获、回执、幂等、子事务回滚、会话设置恢复；发现 F-01～F-03 |
| `packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts`                                                                                                                               | INSERT / UPDATE 载荷分离、审计字段、结果组装、错误传播；未发现新的 UPDATE 功能缺陷                                   |
| `packages/rxdb-adapter-supabase/src/__tests__/cascade-delete-sync.spec.ts`                                                                                                                | 两客户端、源端拉回、混合 INSERT/UPDATE 后删父行与日志顺序；未覆盖隐藏显式子行带 inversePatch 的路径                  |
| `packages/rxdb-adapter-supabase/src/__tests__/mutations-update-payload.spec.ts`、`mutations-update-rls-repro.spec.ts`、`review-regressions.spec.ts`（后两者同目录）                       | 载荷、owner/共享编辑权限、审计字段、服务器最终行、拒绝与整批回滚；断言与 UPDATE 路径一致                             |
| `packages/rxdb-adapter-supabase/src/__tests__/run-supabase-sql-security-regressions.sh`、`supabase-sql-security-regressions.sql`（同目录）、`packages/rxdb-adapter-supabase/project.json` | 用例清单、独立/组合事务入口、生产权限与列权限、可见性转换、多级级联与重试；新增反例见 F-01～F-03                     |
| `requirements/roadmap.md`、`requirements/status-overview.md`                                                                                                                              | 发现 F-04                                                                                                            |
| `requirements/capability-matrix.md`、`requirements/epics/epic-004-future-features.md`                                                                                                     | 核对故事状态、能力及范围；未另立重复问题                                                                             |
| `requirements/stories/adapter/US-223-supabase-mutations-update-semantics.md`、`US-224-supabase-cascade-delete-change-log.md`（同目录）                                                    | AC 与实现、证据层级、范围边界；US-224 的完整快照/去重承诺受 F-01～F-03 影响                                          |
| `CHANGELOG.md`、`packages/rxdb-adapter-supabase/README.md`、`website/docs/adapters/supabase.md`、`website/docs/migration/supabase-update-push.md`                                         | SQL 原子升级顺序、旧客户端兼容、RETURNING 权限、日志读取边界；未另发现升级入口缺陷，级联保证需随 F-01～F-03 修复复验 |
