# Research: US-218 — Supabase 远端启用 RLS 时的推送完整性

**Date**: 2026-10-05 | **Plan**: [plan.md](plan.md) | **Spec**: [spec.md](spec.md)

每条决策按「决策 / 理由 / 备选」给出。代码锚点用符号名或短引文；**推断**表示尚未实测，tasks 阶段以用例核实。
US-220 的决策编号写作 006-D*n*（见 [specs/006 research](../006-us220-update-push-semantics/research.md)）。

## 阶段 A

### D1 DELETE 的零行判定：删后探针

**决策**：`rxdb_mutations` 处理 `p_deletes` 时，每组先照旧调 `rxdb_batch_delete` 拿到删除行数；行数小于本组 `ids` 元素数时，
再对**整组** `ids` 调一次 `rxdb_existing_ids`（F3）。同一事务里刚删掉的行对探针已不存在，所以返回的就是「存在但没删掉」的那部分：

- 返回非空 → 42501，`DETAIL.reason = denied`，`entityId` 取返回数组的第一个元素；整个 RPC 回滚（AC#1、AC#2、AC#5）；
- 返回空 → 没删掉的都是「已不存在」，按幂等成功（AC#4），不抛 `RX001`。

判定只在**显式日志模式**（`p_skip_sync = true`）下执行。

**理由**：

- 幽灵日志只出在显式日志模式：日志由 `p_changes` 先写，删除零行也不回滚它。触发器模式（`mutations()` 直写路径）下零行删除不会触发
  `rxdb_sync_trigger`，不产生日志，也就没有症状 1。门控到推送路径，直写路径行为不变。
- `rxdb_batch_delete(text,text,text[])` 的签名有回归断言（「rxdb_batch_delete text[] RPC signature must remain stable」），不加 `RETURNING`、
  不改返回值，判定放在调用方。
- 「删后再探整组」不需要知道哪些 id 被删掉：同事务内删除已可见，探针的回答天然就是「剩余且存在」。传入 id 有重复或写法差异
  （`uuid` 大小写）时行数比较可能多触发一次探针，结论不变，只多一次查询。
- DELETE 的「已不存在」是成功而 UPDATE 的「已不存在」是 `RX001`：删除的目标状态就是「不在」，已经达成；修改的目标状态无法达成。

**备选**：

- 在 `rxdb_batch_delete` 内部判定：会改变直接调用它的语义，且非同步表上零行删除会撞探针的 22023。否决。
- 先探后删（`rxdb_existing_ids` → 按调用方身份 `SELECT` 对比）：多一次查询且要再算一次差集；删后探针只在零行时多一次。否决。
- 新增 `rxdb_batch_delete_strict` 公开函数：多一个对外签名，判定逻辑只有几行，不值得。否决。

### D2 阶段 A 的落点与顺序

**决策**：阶段 A 不改 `rxdb_mutations` 的参数表与执行顺序（先快照、写日志，再按 upsert → update → delete 写业务表）。
任何一处 42501 / `RX001` / `RX002` 都让整个 RPC 事务回滚，日志与业务行都不落库（AC#5、FR-005）。

**理由**：先写日志、后写业务表的顺序在同一事务里，失败整体回滚，阶段 A 不需要改顺序就能保证「无新日志」。不改参数表，符合 006 plan
F1 的核对要求「US-218 阶段 A 改 DELETE 时不再改 `rxdb_mutations` 的参数表」。

**备选**：阶段 A 就改为先写业务、后写日志——阶段 B 才需要（D6），提前改只会扩大阶段 A 的回归面。否决。

### D3 日志与业务写配对（AC#6）：新码 `RX002`

**决策**：`rxdb_mutations` 开头、写任何东西之前做纯载荷校验，不配对抛 `RX002`（`rxdb_push_integrity`，HTTP 400），`DETAIL` 是
`{op, schema, table, entityId, reason}`，`reason` 取下列之一：

| `reason`                       | 条件                                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------------------- |
| `unpaired_change`              | main 分支的一条显式日志，其（schema、table、entityId）不在任何业务写里                       |
| `unpaired_write`               | `p_skip_sync = true` 时，一次业务写的（schema、table、id）没有任何 main 分支日志             |
| `duplicate_write`              | 同一（schema、table、id）在 `p_upserts` / `p_updates` / `p_deletes` 里合计出现多于一次       |
| `op_mismatch`                  | 该键最后一条 main 日志是 DELETE，却不在 `p_deletes`；或最后一条不是 DELETE，却在 `p_deletes` |
| `explicit_log_in_trigger_mode` | `p_skip_sync = false` 且带 main 分支显式日志（触发器也会记一份，日志会重复）                 |

- 键的比较全部按文本：日志取 `schema`（缺省 `public`）、`table`、`entityId`；业务写取 `table`、`schema`、`data[i]->>'id'` / `ids[i]`。
  客户端两边用的是同一个字符串（**推断**，载荷单测断言）。
- 非 main 分支日志不参与（FR-007）：它们本来就不伴随业务写。
- `p_skip_sync = false` 且没有显式日志（`mutations()` 直写路径）：只要求不重复（`duplicate_write`），业务写由触发器记日志。
- N 条源变更压缩成 1 次业务写：多条日志映射到同一个键，满足「每条日志都有业务写」，视为配对（AC#6 场景 3）。

`op_mismatch` 依赖推送前合并的结果形状：「新建后修改」合并为 insert、「修改后删除」合并为 delete、「新建后删除」两边都不发
（spec Edge Cases）。**推断**合并结果的类型总与最后一条变更一致，tasks 阶段用 `compactChanges` 的单测枚举组合核实；不一致的组合须先改合并，
不放宽规则。

**理由**：只回收日志表直写（阶段 C）关不掉「经推送入口伪造」这一半（spec Assumptions）。纯载荷校验在写之前，失败时两张表都不变，
成本是一次对载荷的遍历，不查表。

**备选**：

- 只校验「每条日志都有业务写」：`p_skip_sync = true` 加无日志的业务写同样能静默改业务表且不留日志，AC#6 要求两向。否决。
- 由服务端从业务写反推日志（不收 `p_changes`）：非 main 分支仍需显式日志，且会丢掉客户端的 `localId` 幂等键。否决。

### D4 阶段 A 的发布方式

**决策**：阶段 A 与阶段 B **同一版本发布**（FR-008 的第一项）。阶段 A 的 PR 可以先合入主干，发布等阶段 B 合入。

**理由**：阶段 A 单独发布后，一条被拒变更会卡住该仓库的推送（整批 42501、水位线不推进），只能手工清理；阶段 B 一到就不需要这套
手工步骤。同版本发布省掉一份很快就作废的恢复文档。

**备选**：单独发布并写手工恢复步骤——只有阶段 B 显著延期时才值得；届时在迁移文档补，不在本 plan 预写。

## 阶段 B：服务端

### D5 回执的开关：`p_receipts`

**决策**：`rxdb_mutations` 加第 6 个参数 `p_receipts boolean DEFAULT false`，DROP 5 参签名（US-220 F1 引入的那个）。

- `p_receipts = true`：逐实体判定，被拒实体不影响其它实体，返回 `entity_results`（D6～D8）；
- `p_receipts = false`（缺省）：同一套代码，但不捕获任何错误，第一个拒绝原样抛出（原 SQLSTATE、`MESSAGE`、`DETAIL`），整批回滚——
  即阶段 A 的全有或全无。

**理由**：旧客户端不认识部分成功。若服务端对它也部分成功，旧客户端只会看到 `change_id_mapping` 少了几项，**推断**会把整批当成功处理并推进
水位线（今天 `getChangeIdMapping` 对缺项不报错），造成「被拒变更被当成已生效」（FR-022 禁止）。所以部分成功必须由客户端显式要求。
参数带默认值，PostgREST 按参数名匹配时，只传前 4 个或前 5 个参数的旧客户端都落到新签名上，行为不变。

**备选**：

- 改返回形状、不加参数：旧客户端无法拒绝部分成功，见上。否决。
- 新建 `rxdb_mutations_v2`：两个函数长期并存，逻辑会漂移；仓库里没有版本化函数名的先例。否决。

### D6 逐实体执行：先整组，组内出错再逐实体重放

**决策**（`p_receipts = true`）：

1. 配对校验（D3），失败直接抛 `RX002`，不产生回执——它是调用方的协议错误，不是某个实体被拒。
2. 按载荷顺序（upsert 组 → update 组 → delete 组）执行业务写。每个组（一个表的一段 `data` / `ids`）先在一个子事务
   （`BEGIN … EXCEPTION`）里整组执行；整组成功则组内实体全部 `applied`。
3. 整组子事务捕获到可归类的错误（D7）时，回滚该组，再按组内顺序**逐实体**在各自子事务里重放，得出每个实体的结果。
   不可归类的错误不捕获，原样抛出，整批失败（AC#13）。
4. 业务写全部结束后，为 `applied` 实体与非 main 分支的日志写 `rxdb_change`（按 `p_changes` 原顺序），`rejected` 实体的日志不写。
5. 返回 `entity_results` 与 `change_id_mapping`（D8）。

`p_receipts = false` 时步骤 2 不开子事务，步骤 3 不存在，错误直接上抛。

**理由**：

- 要在一个事务里让部分实体生效，只能用子事务隔离失败；PL/pgSQL 的 `EXCEPTION` 块就是子事务。
- 每个实体一个子事务会在一批里产生上千个子事务 XID，超过每个后端 64 个的子事务缓存后会触发 `pg_subtrans` 查找退化（PostgreSQL 已知
  性能问题）。整组先跑、只在出错时逐实体重放，成功路径的子事务数等于组数（通常 ≤ 表数 × 3）。
- 重放与逐实体执行结果相同：整组子事务已回滚，没有残留。
- 日志改为「写后记」：逐实体判定后才知道哪些日志该落库；日志 id 仍按 `p_changes` 原顺序分配，拉取方看到的顺序不变。
  快照（步骤 1 的 `beforeData` / `afterData`）仍在业务写之前取，语义不变。

**备选**：

- 每实体一个子事务：实现最简单，但成功路径就有子事务溢出，单批 1000 条时必中。否决。
- 先逐实体用探针预判再整批执行：RLS 的 `WITH CHECK`、外键只有真正写时才知道，预判不完整。否决。

### D7 哪些错误计为「被拒」

**决策**：逐实体执行中捕获并转成 `rejected` 的只有三类，其余错误一律上抛、整批失败、水位线不推进（AC#13、FR-015）：

| SQLSTATE | 来源                                                                   | `reason`     | 说明                                                      |
| -------- | ---------------------------------------------------------------------- | ------------ | --------------------------------------------------------- |
| `42501`  | 本 plan / US-220 的零行判定；RLS `WITH CHECK`（`new row violates …`）  | `denied`     | `WITH CHECK` 的 `DETAIL` 不是 JSON，回执按实体上下文填写  |
| `RX001`  | US-220 UPDATE 目标行已不存在                                           | `gone`       | 计为被拒，不重试（spec Edge Cases「不得退化为无限重试」） |
| `23503`  | 外键违反：父实体被拒、父实体在远端不存在、被引用行在删除时仍被子行引用 | `dependency` | 全部 23503 都归此类，`dependsOn` 尽量解析（D9）           |

- 其它 23 类（23505 唯一、23502 非空、23514 检查约束）不计被拒：它们多半是客户端或模式的缺陷，按失败暴露更安全。登记为后续评估项。
- `RX002` 不在逐实体阶段出现（D6 步骤 1）。
- 客户端分类口径与此表一致（D11），只认 `code`，不解析 `message`。

**理由**：AC#13 要求「只有 plan 列明的 SQLSTATE（至少 42501）计为被拒」。`RX001` 若不计被拒，同一条修改每轮都会以 400 失败，
等于无限重试；23503 若不计被拒，父实体被拒后子实体会让整批永远失败（AC#12），跨批次时（父在上一批被拒）同样如此，所以不限于「同批父实体」。

**备选**：只认 42501，`RX001` 与 23503 上抛——违反 AC#12 与 spec Edge Cases。否决。

### D8 幂等：逐实体判定 + 按 `clientId` 加锁

**决策**：

- 业务写之前，按 `p_changes` 里出现的 `clientId`（排序后）逐个取 `pg_advisory_xact_lock(hashtext('rxdb_mutations:' || clientId))`，
  再一次性查出本批（`clientId`、`localId`）里已在 `rxdb_change` 的那些。
- 一个实体的全部 main 日志都已存在 → 该实体跳过业务写，结果为 `applied`，远端 id 取已有日志；任一条是新的 → 执行该实体。
- 首次被拒的实体日志从未写入，重试时作为新实体**重新判定**（FR-018 的「被正确重新判定」）：远端权限若已放开则这次生效。
- 两种模式都用这条规则。

**理由**：今天是「整批里有任一新日志就执行全部实体操作」。部分成功后，同一批重试时已生效与被拒的实体混在一起，整批口径会把已生效的
再执行一遍（AC#15 禁止）。改成按实体判定后，先查后写之间存在并发窗口（两个相同批次同时到达都看到「新」），所以按 `clientId` 串行化；
同一客户端的推送本来就是串行的，锁不影响不同客户端之间的并发。

**备选**：保留「先插日志、靠唯一约束判重」——插日志必须在写之后（D6），先插就无法只保留生效实体的日志。否决。

### D9 外键依赖的 `dependsOn` 解析与优先级

**决策**：捕获 23503 时用 `GET STACKED DIAGNOSTICS` 取 `CONSTRAINT_NAME`、`SCHEMA_NAME`、`TABLE_NAME`，经 `pg_constraint` 查出被引用表
（`confrelid`）与本表外键列（`conkey`），从本实体载荷里取该列的值作为父实体 id，回执带
`dependsOn: {schema, table, entityId}`；解析不出（多列外键、载荷里没有该列，例如被引用行的删除）时回执带 `dependsOn: {constraint}`。

一个子实体同时会被权限拒绝且外键失败时，以 PostgreSQL 先报出的为准：RLS `WITH CHECK` 在行写入前检查，外键在语句末尾的 RI 触发器里检查，
所以是 `denied`（spec Edge Cases「plan 定优先级」）。

**理由**：AC#12 要求「原因指向父实体」。父实体多数时候在同批里（`entity_results` 里能找到它的被拒原因），也可能在更早的批次被拒；
按约束反查不依赖父实体是否在本批。

**备选**：在服务端按同批父实体被拒结果预先拒绝子实体——需要知道外键关系图，服务端得多维护一份；按错误反查更直接。否决。

## 阶段 B：客户端

### D10 `RemoteMergeResult` 新契约（破坏性）

**决策**：

```ts
interface RemoteMergeResult {
  maxChangeId?: number;
  results: RemoteChangeResult[]; // 必填：本批每条源变更恰好一条
}
type RemoteChangeResult =
  | { localId: number; status: 'applied'; remoteId: number }
  | { localId: number; status: 'rejected'; rejection: RemoteChangeRejection };
```

`changeIdMapping` 删除；远端基类 `mergeChanges()` 的返回类型收窄为 `Promise<RemoteMergeResult>`（去掉 `number | void`）。
推送方要求 `results` 恰好覆盖本批全部源变更（无缺项、无重复、无多余），否则整批失败、水位线不推进（AC#14、FR-017）。
完整形状见 [contracts/remote-merge-result.md](contracts/remote-merge-result.md)。

**理由**：今天「远端返回非映射结果时仍推进水位线」是被测试固定下来的行为（`push-repository.spec.ts` 同名用例返回 77），
它正是 AC#14 要关的口子。可选字段或联合返回类型都允许「什么都不说」，只能改成必填。每条源变更一条结果，扇出（AC#10）由适配器完成，
推送方只做覆盖校验，不再自己猜。

**备选**：保留 `changeIdMapping` 并加 `rejections` 可选字段——两份列表要做交叉校验，且仍允许都缺省。否决。

### D11 Supabase 适配器：保留错误码、构造回执

**决策**：

- `executeRetryableWrite` 与 `classify_postgrest_error` 保留 PostgREST 返回的 `code` / `details` / `hint`，`SupabaseDataError` 增加
  只读的 `code` 与 `details`（FR-016）。
- `mergeChanges()` 调 RPC 时传 `p_receipts: true`；`validateMergeResponse` 增加 `entity_results` 校验（必须是数组，元素字段齐全）。
- 回执构造：对每条源变更，`localId` 在 `change_id_mapping` 里 → `applied`；在某个 `rejected` 实体的 `localIds` 里 → `rejected`，
  `rejection` 由该实体结果构造；两者都不在或都在 → 抛错（不交给推送方再判）。
- `rejection.entity` 的 `namespace` / `entity` 由本批 `changes` 里该 `localId` 的源变更给出；`dependsOn` 的（schema、table）经适配器已有的
  实体元数据反查为（namespace、entity）（**推断**元数据可反查，tasks 核实），反查不到时保留 `constraint` 原样上报。
- 整个 RPC 失败（网络、5xx、`RX002`、未列明的 SQLSTATE）仍以异常抛出，推送方按既有重试语义处理。

**理由**：分类只认 `code`（006 F2 的约定），所以 `code` 必须一路带到推送方；回执构造放在适配器里，推送方对所有远端适配器只看一个形状。

**备选**：在 `rxdb-plugin-sync` 里解析 PostgREST 错误——把 Supabase 的错误格式泄漏进通用插件。否决。

### D12 被拒状态的本地持久化：`RxDBChange` 加两列

**决策**：`RxDBChange` 新增 `rejectedAt`（可空时间戳）与 `rejection`（可空 JSON，形状同 `RemoteChangeRejection`）。
系统模式版本 `RXDB_SYSTEM_SCHEMA_VERSION` 6 → 7：SQLite 侧 `RxDBAdapterSqliteBase.migrateSystemSchema` 按 `ensureBranchActiveKey` 的
写法（`pragma_table_info` + `ALTER TABLE ADD COLUMN`）加列；PGlite 侧 `migrate_system_schema.ts` 同样加列；`migration.spec.ts` 与
`scripts/check-migration-release-gate.mjs` 按新版本更新（FR-021）。

**理由**：被拒是变更的终态，必须跨重启保留，且应用要能查询（AC#16 的列表、FR-012）。复用 `remoteId` 当标记会与「待推」口径冲突
（`query-cache-outbox.ts` 注释已明确反对把 `remoteId` 挪作他用）。两列都可空，旧行不需要回填。

**备选**：单独建 `rxdb_change_rejection` 表——查询待推时要多一次关联，且要自己维护与变更的级联删除。否决。

### D13 「待推」口径：加 `rejectedAt = null`

**决策**：下列以 `remoteId = null` 作为「待推」判据的查询都加 `rejectedAt = null`：

| 位置                                                                                   | 用途                      | 处理 |
| -------------------------------------------------------------------------------------- | ------------------------- | ---- |
| `push-repository.ts` `queryUnpushedChanges`                                            | 取待推变更                | 加   |
| `get-repository-sync-status.ts`                                                        | 仓库同步状态              | 加   |
| `pull-conflict-utils.ts` `queryPendingLocalChanges`                                    | 拉取冲突判定的本地待推    | 加   |
| `pull-round.ts` `backfillOwnChangeRemoteIds`                                           | 回填自己推送变更的远端 id | 加   |
| `query-cache-outbox.ts`（`updatePushableCount` 与 `flushQueryCacheOutbox` 同源的两处） | 出站计数与取行            | 加   |
| `cleanup-expired.ts`（「unpushed」阻止过期清理）                                       | 过期清理                  | 加   |
| `rxdb-plugin-history` `HistoryManager.ts`（`pendingCount` 来源）                       | 待推计数                  | 加   |
| `rxdb-plugin-history` `undo-redo-apply.ts`                                             | 撤销 / 重做               | 不改 |

撤销 / 重做与被拒变更的交互在故事 Out of Scope，`undo-redo-apply.ts` 不改，登记为待评估项。

**理由**：水位线越过被拒变更后，推送本身不会再取到它们；但计数、冲突判定与清理各自独立查询，不加条件就会把被拒变更永远算成「待推」，
`pendingCount` 永不归零、过期清理永远被阻塞。

### D14 本地对齐（AC#11）与提交

**决策**：推送的提交阶段改为：

1. 所有批次推完、回执齐全后，收集被拒实体的键，按实体名分组调远端 `findByIds(entityName, ids)` 取当前值。
2. 一个本地事务里：给 `applied` 源变更写 `remoteId`；给 `rejected` 源变更写 `rejectedAt` / `rejection`；被拒实体在远端存在的用
   `upsertMany` 覆盖、不存在的用 `deleteByIds` 移除（两者都关触发器，不产生 `RxDBChange`，不进撤销栈）；推进 `RxDBSync.lastPushedChangeId`。
3. 对齐写入经 `declareTrustedWrite`，在 `trusted-write-intent.ts` 登记新调用点（意图同拉取应用的 `remote_sync`），
   `audit:callsite-drift` / `audit:suite-callsites` 随之更新。

- `findByIds` 失败：不提交，整轮按失败处理；下一轮重推同一批，被拒实体按 D8 重新判定，结果相同，幂等。
- 被拒实体在本批之外还有更新的本地待推变更（推送期间用户又改了它）：不对齐该实体，那条新变更会在下一轮自己推送并被判定。
- 被拒实体在远端存在但调用方 SELECT 不到：`findByIds` 拿不到，本地按「远端不存在」移除（**推断**可接受：调用方本来就无权看到该行）。

**理由**：FR-013 要求对齐不产生待推变更、不进撤销栈，现有的 `upsertMany` / `deleteByIds` 关触发器写入正好满足，拉取应用走的也是这条路。

**实现修订（2026-10-05）**：推送提交的事务里拿到的是 `TransactionExecutor`，它没有 `upsertMany` / `deleteByIds`；改用同一事务内的
`executor.mergeChanges(actions, undefined, true)`（第三参让本批不写 `RxDBChange`），效果与上述决定相同。
远端读放在本地事务之外，避免持事务做网络 IO。

**备选**：靠下一轮拉取覆盖——拉取只带日志，被拒实体在远端没有新日志，永远不会被拉回。否决。

### D15 框架 API：`SyncState.lastRejections`

**决策**：

- `SyncState` 新增 `lastRejections: readonly SyncRejection[]`：最近一轮**有被拒**的推送产生的被拒列表；与 `lastConflict` 一样是历史事实，
  不会被后续成功清空，下一轮有被拒时整体替换。
- 新导出 `SyncRejectionReport { namespace; entity; entityId; op; code; reason; message; dependsOn? }` 与
  `SyncRejection extends SyncRejectionReport { at: Date; changeIds: readonly number[] }`。
- `SyncStateHub.reportRejections(rejections)` 由 `pushRepository` 在提交事务成功后调用（changelog 推送由 `SyncManager.push` 显式触发，
  `sync-listeners.ts` 的回推轮只管 QueryCache）；`sameState` 增加该字段比较。
- `PushRepositoryResult` 增加必填 `rejected: number`，`pushed` 只数已生效。
- 三框架经各自已有的 `useSyncState()` 暴露（Angular `packages/rxdb-angular/src/use-sync-state.ts`、React、Vue），不新增函数，API 对称。
- 跨重启的完整列表按 `RxDBChange` 的 `rejectedAt` 不为空查询，作为文档里的用法示例，不另加 API。

**理由**：`SyncStateHub` 已经是三框架对称暴露同步状态的唯一通道，`lastConflict` 是同类先例；加字段不加入口，三端绑定只需透传。

**备选**：新增 `useSyncRejections()`——三个绑定各加一个函数、三份测试，内容只是 `SyncState` 的一个字段。否决。

### D16 AC#16 的 demo 范围

**决策**：三框架各有一处展示：`apps/dev-rxdb-supabase`（Angular，连真实 Supabase）显示 `lastRejections` 并以 e2e-remote 触发真实的远端拒绝（`gone`，见本节末）；
`apps/dev-rxdb-react`、`apps/dev-rxdb-vue` 各加一个被拒列表面板，绑定 `useSyncState()`。React / Vue demo 今天不连远端、也不用
`useSyncState`；定为在三端面板组件 spec 里用同一份 `SyncRejection` 夹具断言相同字段与文案，React / Vue e2e 只验空态与 a11y。
否决「只在 e2e 构建启用的会拒绝的远端替身」：要给两个 demo 引入仅测试用的远端代码路径，收益只是重复已由组件 spec 覆盖的渲染。
Angular e2e 用 `gone` 而非 `denied`（参考 `todos` 表未开 RLS、demo 无登录）。spec US5 已登记为批准的偏离。

### D17 版本组合与升级顺序

| 客户端                    | 远端 SQL    | 结果                                                                                              |
| ------------------------- | ----------- | ------------------------------------------------------------------------------------------------- |
| US-220 之前               | 阶段 A / B  | 4 个参数落到 6 参签名，`p_receipts` 取默认 false：全有或全无；不配对 / 被拒以错误抛出             |
| US-220（5 参）            | 阶段 B      | 同上                                                                                              |
| 阶段 B（传 `p_receipts`） | 阶段 B 之前 | PostgREST 找不到带 `p_receipts` 的函数 → `PGRST202` → `SupabaseDataError`；推送失败，水位线不推进 |
| 阶段 B                    | 阶段 B      | 本 plan                                                                                           |

升级顺序：先执行新版参考 SQL，再升级客户端；写进迁移文档（FR-022）。任何组合都不会部分成功而不告知客户端。

## 阶段 C

### D18 日志表写入收口

**决策**：

- **函数改动进基础 SQL**（开发与生产跑同一份代码）：
  - `rxdb_log_change_trigger` 改为 `SECURITY DEFINER`（触发器函数不能被直接调用，DEFINER 只扩大它自己的写权限）；
  - 新增内部 `rxdb_insert_changes(p_changes jsonb) RETURNS ...`，`SECURITY DEFINER`，`rxdb_mutations` 写日志改调它。它必须对客户端角色
    `GRANT EXECUTE`（INVOKER 的 `rxdb_mutations` 以调用方身份调它），所以加一道事务级 GUC 守卫：`rxdb_mutations` 调用前
    `set_config('rxdb.insert_changes', 'on', true)`、调用后立刻清掉，helper 入口检查并消费该值，不是 `on` 就 42501。
- **生产权限进单独脚本** `docker/sql/production/rxdb-change-grants.sql`（`init-db.sh` 不自动加载）：对 `anon` / `authenticated`
  `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.rxdb_change` 及其序列的 `USAGE` / `UPDATE`，保留 `SELECT`（拉取函数
  `rxdb_pull_changes` 与 realtime 都以调用方身份读它）。
- **开发默认保持宽松**：10 个 Supabase 测试文件用 `VITE_SUPABASE_KEY`（anon）直接清理 `rxdb_change`，收紧开发默认会破坏它们。
- SQL 回归在 `BEGIN … ROLLBACK` 里执行生产脚本再断言 AC#17（`authenticated` 直接 INSERT 被拒）、AC#18（非 main 分支推送照常写日志）
  以及触发器路径与推送路径仍能写日志。

**理由**：PostgREST 不暴露 `pg_catalog`，客户端无法调用 `set_config` 伪造守卫；GUC 是事务级的且用完即清，pg_graphql 在同一事务里
先调 `rxdb_mutations` 再直调 helper 也会被拒。

**备选**：

- `rxdb_mutations` 整体改 DEFINER：DEFINER 函数里不能 `SET ROLE` 回调用方，业务写会绕过 RLS，正好违背本故事。否决。
- 日志完全由触发器生成：非 main 分支只写日志不写业务表，仍需要显式写日志的路径。否决。

**已知限制**（写进站点文档，FR-025）：非 main 分支日志仍可经 `rxdb_mutations` 伪造（它们不进 main 的拉取）；`rxdb_branch` 仍对客户端开放，
不在本故事范围；测试清理改用 `service_role` 后开发默认才能收紧，登记为后续项。

## 横切

### D19 性能（SC-009）

**决策**：成功路径的增量是 D3 的载荷遍历、D8 的一次已存在日志查询与每个 `clientId` 一把咨询锁、D6 的每组一个子事务；探针只在零行时执行。
连真实 Supabase 的阶段 B spec 记录单批耗时作为 < 100 ms 的验证数据（**推断**可达）。

### D20 范围外但需登记

- 推送路径 `p_skip_sync = true` 时，`ON DELETE CASCADE` 级联删除的子行不产生日志（**推断**今天即如此，与本故事无关）。
- 23505 / 23502 / 23514 是否计为被拒（D7）。
- 撤销 / 重做与被拒变更的交互（D13）。
- SQL 安全回归接入 CI（同 006 quickstart 的待评估项）。
