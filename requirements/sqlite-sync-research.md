# sqlite-sync 调研与后续决策依据

> 调研日期：2026-11-10。范围：[sqliteai/sqlite-sync](https://github.com/sqliteai/sqlite-sync) 主仓（1.2.2，提交 `9e372e88`）的源码、`API.md`、`CHANGELOG.md`、`PERFORMANCE.md` 与 `docs/`；
> [sqliteai/sqlite-wasm](https://github.com/sqliteai/sqlite-wasm)（提交 `aad21431`）的打包脚本与 `wasm.c`；本仓库锁定的 `@sqliteai/sqlite-wasm@3.50.4-wasm.1.0.0-sync.1.2.1-vector.1.2.0-memory.1.3.6`。
> 本文记录接入判断、可借鉴方向和边界；不创建用户故事，不代表排期。「源码实证」指读过对应代码或测试，「文档声明」只来自上游文档，**推断**是未经用例验证的判断。

## 结论

**❌ 不接入 sqlite-sync；✅ 借鉴它在同步链路上的几处工程细节。**

sqlite-sync 是照搬 cr-sqlite 的 CRDT 扩展：冲突全部自动裁决、不留给用户，服务端绑定 SQLite Cloud 托管的 CloudSync，合并写入绕开 RxDB 引擎直接落表。
这三点分别与 RxDB 的同步冲突方向（git 式、由用户裁决，见 [LiveStore 调研](livestore-research.md)的结论表）、服务端自主可控、引擎持有写入路径相冲突。

对照中发现的拉取游标漏行问题，修复见下文 P0，状态以 [RV-01a1c49dee517814adf2e68788ad084e](reviews/rxdb-adapter-supabase/RV-01a1c49dee517814adf2e68788ad084e-pull-cursor-commit-order.md) 为准。

| 日期       | 事项                            | 结论性质 | 记录                                                                                |
| ---------- | ------------------------------- | -------- | ----------------------------------------------------------------------------------- |
| 2026-11-10 | 研究 sqlite-sync 对本仓库的价值 | 用户请求 | 对照现有同步插件、Supabase 适配器与 sqliteai 适配器，判断能否直接利用、有哪些可借鉴 |
| 2026-11-10 | 先修拉取漏行，再落本文          | 用户决定 | 修法选全局事务级咨询锁，不改游标协议；推送遇到 `40P01` 自动重试                     |
| 2026-11-10 | 上游 npm 包许可前后矛盾         | 用户决定 | 起草给 sqliteai/sqlite-wasm 的 issue，由用户提交；本仓库不改依赖                    |

## 两个仓库是什么

- **sqliteai/sqlite-wasm** 只是打包仓库：用 Emscripten 把官方 SQLite WASM 与 sync / vector / memory 三个扩展静态编进同一个 wasm，每条连接经 `sqlite3_auto_extension` 自动注册（源码实证，`wasm.c`）。
  [rxdb-adapter-sqliteai](../packages/rxdb-adapter-sqliteai/README.md) 依赖它，sync 扩展一直在包里，代码里从未调用。扩展注册时只登记函数与虚拟表，库里没有 `cloudsync_init` 留下的配置就不建表、不读写（源码实证，`dbsync_register_functions`）。
- **sqliteai/sqlite-sync** 是同步本体：客户端扩展（SQLite）、服务端扩展（PostgreSQL，beta）与托管的 CloudSync 服务三件套，网络层编在客户端扩展里，以 SQL 函数暴露（`cloudsync_network_sync()` 等）。

## 现有能力对照

| 维度     | sqlite-sync                                                                                                                                                                                  | RxDB                                                                                                                        | 判断                                                      |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 同步模型 | 状态型 CRDT：每张同步表配一张 `<表>_cloudsync` 元数据表，按 (主键, 列) 记 `col_version` / `db_version` / `site_id` / `seq`；下发时值从业务表现取                                             | 操作日志：`rxdb_change` 记每次变更的 `patch` / `inversePatch` 与前后快照，按 `transactionId` 归组，服务历史、撤销与分支     | 两者都靠触发器捕获变更；RxDB 的日志还要服务历史，不可替换 |
| 冲突     | 行级用因果长度（奇数存在、偶数删除）；列级先比 `col_version`（约等于编辑次数，不是时间），再比值的大小，最后比 `site_id`；没有冲突回调。README 列的 DWS / AWS 在源码里报 `not yet supported` | 现行 LWW 比较 `createdAt`；方向是 git 式：远端即分支，冲突停在工作树的合并状态由用户裁决                                    | 方向相反                                                  |
| 传输     | 只连 CloudSync；`cloudsync_payload_chunks` / `cloudsync_payload_apply` 可自带传输                                                                                                            | 适配器自带：Supabase（RPC 与 PostgREST）、HTTP（只支持 `QueryCache`）                                                       | RxDB 的传输可替换                                         |
| 服务端   | CloudSync 是 Go 写的多租户服务，经 S3 中转载荷，sqliteai 与 sqlitecloud 两个组织都没有公开代码；自建 PostgreSQL / Supabase 也要在 SQLite Cloud 控制台登记数据库连接串                        | 参考 SQL 是一组 plpgsql 函数与触发器，可部署到任意 Supabase                                                                 | RxDB 服务端自主可控                                       |
| 权限     | 读变更时 LEFT JOIN 业务表、以调用者角色执行，看不到的行不下发；删除标记只带主键、下发给所有人（文档写明）                                                                                    | 日志存完整快照，参考部署里 `anon` 可读；[Supabase 文档](../website/docs/adapters/supabase.md)要求应用单独设计日志的读取策略 | 见下文 P1                                                 |
| 大载荷   | 分块生成、开始时固定上界水位、续传游标、窗口字节预算（总在事务边界结束）、单个大值切片乱序到达                                                                                               | 推送按 `batchSize` 分批，拉取按 `limit` 翻页                                                                                | 现有规模够用，暂不借鉴                                    |
| 宿主     | 原生多平台 + WASM；WASM 版网络走 Emscripten 同步 fetch，只能在 Worker 里跑，网络等待期间持有库的读写                                                                                         | Web、Electron、Tauri、PWA、小程序；查询经适配器异步执行                                                                     | 同步阻塞会卡住 RxDB 的连接                                |
| 文本     | Block-level LWW：文本按行切块，用分数索引排序，不同行的并发编辑都保留，同一行后写胜                                                                                                          | 字段级：两端改同一文本字段即冲突                                                                                            | 见下文 P2                                                 |
| 许可     | 2026-10-19 起 Apache-2.0；此前是改版 ELv2，禁止替换或绕开网络层                                                                                                                              | MIT                                                                                                                         | 见「许可与依赖风险」                                      |

## 不接入的原因

1. **冲突语义与既定方向相反。** 上游主打「永远不需要人工解决冲突」，胜负按编辑次数、值大小与 `site_id` 自动决出，被覆盖的一方无从得知
   （源码实证，[`merge_did_cid_win`](https://github.com/sqliteai/sqlite-sync/blob/9e372e883bf1d2a475352f2c072529ffb3c1940a/src/cloudsync.c#L1930)）。
   RxDB 要的是冲突停在合并状态，由用户逐项裁决。
2. **合并写入绕开 RxDB 引擎。** **推断**：远端变更经 SQL 直接写业务表，会触发 RxDB 自己的变更触发器
   （[trigger_sql.ts](../packages/rxdb-adapter-sqlite-core/src/table/trigger_sql.ts)），被记成本地变更：进撤销栈，`remoteId` 为空，会被 RxDB 的同步再推一遍。另有几处不匹配：
   - 工作树的影子表集与分支语义都带不过去；
   - 只有 sqliteai 一个适配器带这个扩展；
   - `cloudsync_init` 要求非空列都有 `DEFAULT`，[RxDB 生成的建表语句](../packages/rxdb-adapter-sqlite-core/src/table/create_table_sql.ts)只在实体声明了默认值时才写；
   - C 列的表一次 INSERT 共写约 C+2 行，删除留下的墓碑不自动回收（文档声明，`PERFORMANCE.md`），叠加在 RxDB 自己的日志之上。
3. **服务端绑定托管服务。** 客户端网络层只对接 CloudSync；托管版 Supabase 装不了这个 C 扩展，文档只给出替换 Postgres 镜像的自托管路线，PostgreSQL 端官方标为 beta（文档声明）。
4. **同步会卡住整个库。** 网络等待期间持有库的读写，请求默认超时 300 秒（文档声明，`API.md`）。sqliteai 适配器的一个 Worker 同一时间只借给一条连接，同步期间 RxDB 的查询全部排队。

只用 `cloudsync_payload_*` 接自己的传输，同样绕不开第 1、2 条。

## 已借鉴：日志 id 顺序等于提交顺序（P0）

sqlite-sync 1.2.0 修过同类问题：变更落在已经下发过的 `db_version` 上，下一次下载的窗口从该版本之后开始，对端漏收
（[CHANGELOG](https://github.com/sqliteai/sqlite-sync/blob/9e372e883bf1d2a475352f2c072529ffb3c1940a/CHANGELOG.md)）。

RxDB 的 Supabase 拉取以 `rxdb_change` 的自增 `id` 为游标，每次取 `id` 大于上次位置的变更；`rxdb_mutations` 只给同一 `clientId` 的推送加咨询锁。
先拿到 `id` 却晚提交的事务，会被已经越过它的拉取方永久漏掉，而且不报错（源码实证并复现）。

修复：参考 SQL 给 `rxdb_change` 挂语句级 BEFORE INSERT 触发器 `rxdb_change_serialize_append`，取一把全库共用的事务级咨询锁、持有到提交。
语句级触发器先于 serial 默认值求值（实测），推送、同步触发器与直接写日志表的路径都经过它。代价是写日志的事务在尾段排队；直写业务表的多语句事务与推送改到同一行时可能互锁，适配器把 `40P01` 列为可重试。
部署说明见[迁移说明](../website/docs/migration/supabase-change-log-order.md)，处理经过见 RV 记录。

复验（需本检出的隔离测试栈）：

```bash
pnpm nx run rxdb-adapter-supabase:test-env
pnpm nx test rxdb-adapter-supabase -- src/__tests__/pull-commit-order.spec.ts --coverage.enabled=false
```

## 可借鉴方向

优先级是相对判断，成本未经原型验证。

### P1：日志可见性跟随业务表 RLS

sqlite-sync 读变更时 LEFT JOIN 业务表、以调用者角色执行：调用者看不到的行不下发，值也从业务表现取，日志里不存数据副本；删除标记只带主键，文档写明下发给所有人
（源码实证，[`cloudsync_postgresql.c`](https://github.com/sqliteai/sqlite-sync/blob/9e372e883bf1d2a475352f2c072529ffb3c1940a/src/postgresql/cloudsync_postgresql.c#L3377)）。

RxDB 的拉取直接读 `rxdb_change`，日志里有完整的前后快照，业务表的 RLS 管不到它。可借鉴的做法：拉取 RPC 以 `SECURITY INVOKER` 用 `EXISTS` 关联业务表判可见性，删除只下发主键。
要一起评审的边界：Filter 同步依赖日志里的 `beforeData` / `afterData`；级联删除补出的隐式日志带着调用者看不到的子行快照。

入场信号：出现多租户部署，或日志读取范围成为安全评审的具体问题。

### P1：空窗口也推进游标

做了上一条之后，游标只能停在最后一条可见的行，之后每次拉取都要重扫看不到的那些行。
sqlite-sync 1.2.1 的做法：窗口里调用者一条都看不到时，返回一个只带水位的空结果，游标照样前进；水位从元数据求，不受可见性截断（文档声明，CHANGELOG 1.2.1）。
RxDB 的拉取结果需要带上「扫描到了哪」，与上一条一起做。

### P2：文本字段按行三方合并

Block-level LWW 把文本按行切块合并，不同行的并发编辑都保留。按 git 式方向，对应的是 diff3 行级三方合并：两端改同一文本字段的不同行自动合并，改到同一行停在合并状态。
不引入 CRDT，与[历史插件](../website/docs/plugins/rxdb-plugin-history/README.md)的分支合并预览共用基线。入场信号：长文本字段在合并预览里频繁报 `overwrite` 冲突。

### P2：schema 哈希握手

每个载荷带同步表结构的哈希，服务端不认就明确拒收（文档声明，`docs/schema.md`）。RxDB 的 `rxdb_server_version` 只返回 PostgreSQL 版本号，客户端实体结构与远端表结构不一致时，要等到具体写入失败才暴露。
入场信号：多个应用版本同时在线、远端表结构开始演进。

### P2：服务端忙的语义

`429`，或带 `Retry-After` 的 `503`，不当作错误：结果里带 `retryAfter`，到期前不再请求。`202` 表示已接收、稍后应用，确认之前仍报「有未确认的本地变更」（文档声明，CHANGELOG 1.2.1）。
RxDB 的写入重试只认网络层的瞬时故障与 `40P01`。入场信号：远端开始限流，或接入自建的 HTTP 同步后端。

## 不建议照搬的部分

1. **CRDT 自动裁决。** 与 git 式方向相悖；无需决策的数据另按 LiveStore 调研里的并行模式过渡。
2. **网络层编在 SQL 函数里。** 网络等待期间持有数据库，与 RxDB 一条连接串行全部查询的架构冲突。
3. **按列存时钟的元数据表。** RxDB 的操作日志已有逐字段的 `patch`，再加一套元数据表只会翻倍写放大。
4. **在 RxDB 表上直接启用 `cloudsync_init`。** 两套触发器互相记账，见「不接入的原因」第 2 条。

## 许可与依赖风险

- sqlite-sync 在 2026-10-19 之前是改版 ELv2：明文禁止修改、替换或绕开网络层，闭源商用需要商业许可；之后改为 Apache-2.0（源码实证，`LICENSE` 的 git 历史）。
- 本仓库锁定的 `@sqliteai/sqlite-wasm` 包里，`package.json` 写 `Apache-2.0`，随包的 `LICENSE.md` 仍是旧的 ELv2 文本（源码实证，上游 `sqlite-wasm/LICENSE.md` 未随根目录许可一起更换）。
  这与是否使用 sync 无关，现有 sqliteai 适配器的下游都会读到矛盾的许可，已起草上游 issue。
- 上游迭代快（1.0 到 1.2.2 之间多次修复游标、分块与 PostgreSQL 版本号分配），后续再评估时须按当时版本重新核对。

## 来源与复核方式

| 编号 | 来源                                                                                                                                                      | 核对内容                                                      |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| S01  | [sqlite-sync README](https://github.com/sqliteai/sqlite-sync/blob/9e372e883bf1d2a475352f2c072529ffb3c1940a/README.md)                                     | 定位、CRDT 宣称、Block-level LWW、后端组合                    |
| S02  | [API.md](https://github.com/sqliteai/sqlite-sync/blob/9e372e883bf1d2a475352f2c072529ffb3c1940a/API.md)                                                    | `cloudsync_init` 表结构检查、payload 分块、网络函数与持锁说明 |
| S03  | [src/cloudsync.c](https://github.com/sqliteai/sqlite-sync/blob/9e372e883bf1d2a475352f2c072529ffb3c1940a/src/cloudsync.c)                                  | 合并规则、因果长度、DWS / AWS 未实现                          |
| S04  | [docs/postgresql/README.md](https://github.com/sqliteai/sqlite-sync/blob/9e372e883bf1d2a475352f2c072529ffb3c1940a/docs/postgresql/README.md)              | CloudSync 架构（Go、多租户、S3）与 PostgreSQL beta            |
| S05  | [自建 PostgreSQL 快速开始](https://github.com/sqliteai/sqlite-sync/blob/9e372e883bf1d2a475352f2c072529ffb3c1940a/docs/postgresql/quickstarts/postgres.md) | 自建数据库仍须在 SQLite Cloud 控制台登记                      |
| S06  | [RLS 参考](https://github.com/sqliteai/sqlite-sync/blob/9e372e883bf1d2a475352f2c072529ffb3c1940a/docs/postgresql/reference/rls.md)                        | 按调用者读变更、删除标记的可见范围                            |
| S07  | [PERFORMANCE.md](https://github.com/sqliteai/sqlite-sync/blob/9e372e883bf1d2a475352f2c072529ffb3c1940a/PERFORMANCE.md)                                    | 写放大、墓碑、同步持锁                                        |
| S08  | [CHANGELOG.md](https://github.com/sqliteai/sqlite-sync/blob/9e372e883bf1d2a475352f2c072529ffb3c1940a/CHANGELOG.md)                                        | 1.2.0 的版本号分配修复、1.2.1 的空窗口与忙状态语义            |
| S09  | [sqlite-wasm 的 wasm.c](https://github.com/sqliteai/sqlite-wasm/blob/aad2143190706be0caea8545c478ac765f75d469/wasm.c)                                     | 静态链接三个扩展、同步 fetch                                  |
| S10  | [sqlite-wasm 的 README](https://github.com/sqliteai/sqlite-wasm/blob/aad2143190706be0caea8545c478ac765f75d469/sqlite-wasm/README.md)                      | sync 不能在主线程运行                                         |
