# LiveStore 竞品调研与后续决策依据

> 调研日期：2026-11-10。范围：LiveStore 主仓 main（0.5.0，提交 `487b95e4`）的源码、`docs/` 文档与 `context/` 设计记录，
> [livestore-contrib](https://github.com/livestorejs/livestore-contrib) 的包清单，与当前 RxDB main 对照。
> 本文记录功能差异、可借鉴方向、最小验证和边界；不创建用户故事，不代表排期或交付承诺。
> 「源码实证」指读过对应代码或测试，「文档声明」只来自双方文档，**推断**是未经用例验证的判断。
> LiveStore 仍是 beta，当前状态与未完成项以其官方文档为准，后续立项时需要按当时版本重新核对。

## 结论

**✅ 值得借鉴，但不建议把 RxDB 改造成 LiveStore。**

LiveStore 的核心心智模型是：

```text
事件日志 → SQLite 投影 → 响应式查询 → 事件同步
```

RxDB 当前的核心模型是：

```text
实体 / 关系模型 → 本地数据库 → Repository / 响应式查询 → 可插拔同步、历史与插件
```

LiveStore 的优势是事件日志、投影重建和同步协议高度统一，并在同步正确性与可诊断性上做了大量工程；RxDB 的优势是实体关系、树、图、QueryCache、加密、历史分支、三框架和多宿主适配器。

最值得学的不是事件溯源本身，而是四件能直接落在现有实体模型与同步插件上的事：

1. 由同步后端裁定变更顺序，不让客户端时钟决定冲突胜负；
2. 记录远端身份，远端被重置时显式处理，而不是停在失效的游标上；
3. 把同步链路做成可观察、可模拟离线的开发工具；
4. 区分「多端收敛」与「业务不变量仍然成立」，为后者设计出路。

事件原生模式（可选 eventlog 插件）保留为候选，**价值待证**：没有具名的审计、重放、AI agent 或协作场景前不立项。
更便宜的第一步是给事务附加领域意图（版本化事件名与参数），先拿到审计和活动流收益，不改变事实源。

## 现有能力对照

### 数据与同步

| 维度            | LiveStore 当前能力                                                                                                                                             | RxDB 当前能力                                                                                                                  | 判断                                                                 |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| 事实源          | 不可变、按顺序排列的事件日志；SQLite 是可随时重建的投影                                                                                                        | 实体数据是主模型；`RxDBChange` 是带 `transactionId` 的行级变更日志                                                             | LiveStore 的审计、重放和故障重现更自然                               |
| 写模型 / 读模型 | 事件定义与 SQLite 表、materializer、查询分开声明；服务端客户端可以用不同的 state schema                                                                        | `@Entity` 统一生成表、类型、Repository、关系和查询入口                                                                         | RxDB 更适合传统业务与复杂关系                                        |
| 读取路径        | 每个会话在主线程持有一份内存 SQLite，查询同步返回、没有加载态；持久库归 leader 线程                                                                            | 查询经适配器异步执行，hook 返回带 `isLoading` 的资源                                                                           | LiveStore 首帧不闪烁；代价是每个标签页一份内存副本，数据要装得进内存 |
| 查询            | 内置查询构建器 + 任意 SQLite SQL；signals 式响应式图（`queryDb` / `computed` / `signal`）                                                                      | 类型化实体查询、Observable、游标、树查询、图查询、全文搜索                                                                     | LiveStore SQL 能力更直接，RxDB 业务语义更强                          |
| 本地存储        | Web 只支持 OPFS，无痕模式退为内存并经 `storageMode` 告知；Node 适配器同样用 SQLite WASM，Expo 用原生 `expo-sqlite`                                             | wa-sqlite（默认 IndexedDB，OPFS 实验性）、sqlite-wasm、官方 SQLite、SQLiteAI、PGlite、Electron、Tauri、小程序                  | RxDB 的运行时覆盖更广；LiveStore 的 OPFS 路径更成熟                  |
| 多标签页        | SharedWorker 代理 + 单个 leader worker 写入；Android Chrome 没有 SharedWorker 时自动退为单标签页                                                               | Web Locks 选 leader + BroadcastChannel 事件网关；wa-sqlite 可选把一条连接放进 SharedWorker 共用                                | 思路接近；LiveStore 的降级是默认行为                                 |
| 同步            | 事件 push/pull：先 pull 后 push，后端串行处理 push 并维持全局总序，客户端对 pending events 做 rebase                                                           | `Full`、`Filter`、`QueryCache`；`syncManager` 连接 Supabase、HTTP 等适配器，拉取以远端 change id 为游标                        | LiveStore 协议更统一；RxDB 更适合远端行模型                          |
| 冲突            | 无字段级合并；按后端裁定的总序重放，「后写者胜」指总序靠后，与客户端时钟无关                                                                                   | LWW 比较两侧 `createdAt`，相等时按 `clientId` 字典序决胜；自定义 resolver 只能落在 `KEEP_LOCAL` / `KEEP_REMOTE`                | RxDB 有明确的行级冲突入口，但时间语义需要核实，见 P0                 |
| 语义合并        | 文档写明 merge conflict handling 尚未实现；command replay 仍是 RFC                                                                                             | `MERGE` / `DEFER` 让整轮拉取抛错回滚、水位不推进，并派发 `ConflictPendingEvent`                                                | 两边都没有持久化的待处理冲突；不应把 rebase 当成领域合并             |
| 历史与版本      | Undo/Redo 与版本控制只有方向说明，示例仍是 TODO                                                                                                                | 历史、Undo/Redo、分支、对比与合并预览、只读检出、带 CAS 的工作树提交、会话回放                                                 | RxDB 明显领先                                                        |
| 迁移            | state schema 变化时新建 state DB 并重放全部事件，可配批次、中断后重试；未知事件按 `warn` / `ignore` / `fail` / `callback` 处理；存储格式版本变化会重置本地数据 | 应用迁移只有 `up()`（`down()` 预留、运行时不调用）；系统 schema 或 change codec 高于自身版本时拒绝连接；迁移发布走桥接版本门禁 | LiveStore 的投影迁移轻；RxDB 对既有数据库更可控                      |
| 加密            | 不支持，文档建议用自定义 Schema 变换自行加密事件                                                                                                               | 字段级加密内建在 sqlite-core 与 PGlite 适配器                                                                                  | RxDB 领先                                                            |
| 搜索、文件、P2P | 无内建；文件、富文本、在线状态只给集成建议；同步必须经中心后端，不能 P2P                                                                                       | FTS5 / pg-tsvector 搜索、文件存储、已认证的 P2P 文件共享                                                                       | RxDB 领先                                                            |
| 框架            | 主仓只有 React；Solid、Svelte 在 livestore-contrib；Vue 是社区包 `vue-livestore`（beta）；另有 Custom Elements 文档；没有 Angular                              | Angular / React / Vue 三端 API 与插件绑定，对称性有门禁                                                                        | RxDB 的三框架对称是差异化优势                                        |
| 平台            | 主仓：Web、Cloudflare Durable Objects；contrib：Node（含 Bun / Deno）、Expo（不含 Expo Web）；Electron / Tauri 走 Web 适配器，原生适配器仍在 issue 跟踪        | Web、Electron、Tauri、PWA、小程序；Node 侧有以 RxDB 引擎实现的参考后端（US-216）                                               | RxDB 的宿主矩阵更完整；LiveStore 多了 React Native 与边缘运行时      |
| 同步后端        | Cloudflare（主仓；DO SQLite 或 D1，WebSocket / HTTP / DO RPC）；ElectricSQL、S2（contrib）；可自定义 provider                                                  | Supabase（RLS 与逐实体回执）、HTTP（只支持 `QueryCache`）                                                                      | LiveStore 的 Cloudflare 参考实现更完整；RxDB 能对接已有 Postgres     |
| 产品边界        | 文档列明不适合：已有数据库作事实源、高连接度社交业务、完全去中心化 P2P、数据装不进内存                                                                         | 支持已有远端数据、QueryCache 海量数据、树、图、P2P、复杂关系                                                                   | 两者应保持不同定位                                                   |

### 工程与工具

| 维度          | LiveStore 当前能力                                                                                                                                                                     | RxDB 当前能力                                                                                                                                             | 判断                                                            |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 同步状态      | `store.syncStatus()` 给出 localHead / upstreamHead / pendingCount / isSynced，另有 `useSyncStatus`、`networkStatus`                                                                    | 三端 `useSyncState()` 给出 online / pendingCount / syncing / lastError / lastConflict / lastRejections；`RepositorySyncStatus` 带推拉游标与可推、可拉计数 | 基本对等；RxDB 多了错误与拒绝信息，LiveStore 多了 head 位置     |
| DevTools 内容 | 数据浏览（可编辑）、活查询检视、事件日志、同步头、导入导出、响应式图、SQLite playground、模拟离线的同步开关                                                                            | Events、Database 查询、分支、OPFS、Storage、I18n、Settings                                                                                                | RxDB 缺查询检视、同步诊断、SQL playground 与模拟离线            |
| DevTools 协议 | 版本化消息协议，会话广播发现，版本不匹配时显式回复；面板单独发布                                                                                                                       | v2 协议有版本协商、能力档位（`none` / `readonly` / `full`）、授权与分块传输，并有 control / data plane 一致性套件；只支持一个 RxDB 实例                   | 协议层对等，RxDB 的权限控制更细；LiveStore 支持多会话发现       |
| 调试入口      | `__debugLiveStore.<storeId>._dev` 可下载状态库与事件日志、硬重置、查看同步状态                                                                                                         | 备份恢复（US-217）是应用侧 API；没有开发态控制台入口                                                                                                      | 可补开发态入口                                                  |
| 可观测性      | 内建 OpenTelemetry，默认 no-op tracer，由应用提供 provider；Cloudflare 后端可接 OTLP                                                                                                   | 没有 OpenTelemetry 接入                                                                                                                                   | LiveStore 领先                                                  |
| 测试与验证    | 同步 provider 一致性套件（Cloudflare 三种传输 × 两种存储加 mock，共 7 个实现）；开发模式比对 session 与 leader 的物化哈希；适配器与框架一致性套件、确定性 oracle、性能阈值都登记为未建 | 跨后端共享套件（事务、QueryCache 行契约、约束、加密等）、工作树 capture / commit 一致性用例、三端 e2e golden 语义对拍                                     | RxDB 在适配器与框架层领先；LiveStore 的运行时确定性守卫值得借鉴 |
| 性能基线      | 仿 js-framework-benchmark 的场景测交互延迟（Event Timing API，15 次取中位数与 IQR）和主线程堆内存，每次提交运行，没有阈值门禁                                                          | 浏览器多后端吞吐与延迟基准；搜索与工作树有阈值门禁；工作树 UI 有三端首帧计时                                                                              | RxDB 的门禁更硬；LiveStore 覆盖了日常读写交互                   |
| 面向 AI       | npm 包附带完整 `docs/` 并给出 AGENTS.md 规则；实验性 CLI 与 MCP：文档与示例 schema、连接实例跑只读 SQL、提交事件、同步导出导入                                                         | 核心包附带 `skills/aiao-rxdb/SKILL.md`，文档站生成 llms.txt（US-602）；没有 MCP                                                                           | 文档投递对等；运行时 MCP 工具 LiveStore 领先                    |
| 设计记录      | `context/` 意图层：子系统各有 intuition / requirements / spec，`.decisions/` 记录被否决方案，`.delta/` 记录规格与实现的已知差距，`ontology.md` 统一术语                                | `requirements/` 管故事、状态与能力矩阵，评审问题入 `reviews/`；架构取舍散在 TSDoc 与迁移文档                                                              | LiveStore 的取舍与差距更容易追溯                                |

RxDB 侧的复验入口：
[`LWWConflictResolver`](../packages/rxdb/src/sync-contract/LWWConflictResolver.ts)、
[`ConflictResolution`](../packages/rxdb/src/sync-contract/conflict.ts)、
[`SyncState`](../packages/rxdb/src/sync-state.ts)、
[`RepositorySyncStatus`](../packages/rxdb-plugin-sync/src/get-repository-sync-status.ts)、
[`RxDBTabsGateway`](../packages/rxdb/src/gateway/RxDBTabsGateway.ts)、
[`LeaderElection`](../packages/utils/src/@browser/leader-election.ts)、
[`RxDBResource`](../packages/rxdb-react/src/hooks.ts)、
[`MigrationType`](../packages/rxdb/src/rxdb.interface.ts)、
[`createConnectorNegotiation`](../packages/rxdb-devtools/src/v2/negotiation-connector.ts)、
[`DEVTOOLS_CAPABILITIES`](../packages/rxdb-devtools/src/v2/capability.ts)、
[`runQueryCacheRowContractSuite`](../packages/rxdb-test/src/query-cache-contract/row-contract.suite.ts)、
[e2e-parity](../modules/e2e-parity/README.md) 与 [benchmarks](../benchmarks/README.md)。
文档入口见[能力矩阵](capability-matrix.md)、[同步策略](../website/docs/collaboration/sync.md)、[历史插件](../website/docs/plugins/rxdb-plugin-history/README.md)、[适配器文档](../website/docs/adapters/README.md)和[DevTools 文档](../website/docs/devtools/README.md)。

## LiveStore 的优势（已核对源码与文档）

### 1. 事件日志把写入、同步、审计和重建串成一条路径

LiveStore 的事件包含事件名、参数、全局序号、父序号、客户端和会话信息。客户端提交事件后，事件先写入本地日志，再由 materializer 更新 SQLite；远端同步的也是事件，不是状态表。

这带来三个直接收益：

- 同一份事件流可以重建不同的读模型；
- 调试时可以看到“谁在什么时候提交了什么”；
- 同步冲突可以先处理事件顺序，再重放状态。

RxDB 的 `RxDBChange` 已经保存了变更和反向补丁，但它表达的是行变化，不一定表达业务意图。例如“把任务移动到下一列”与“更新 `columnId`”在行日志里相同，在事件日志里可以是不同的领域事件。

### 2. 全局总序和 rebase 规则容易解释

LiveStore 要求客户端先 pull 上游事件，再 push 本地事件。上游推进时，客户端回滚分叉后的 pending events，将它们重新挂到新的上游 head 上，再继续推送。

这不是完整的语义冲突合并，但它保证了同一事件序列最终落到同一状态，协议边界比“每个远端适配器各自实现一套合并逻辑”清楚。

几个细节让这条规则站得住：后端一次只处理一个 push；客户端序号带 rebase generation，leader 拒收旧一代的 push；
`clientId` 撞号时由后端在首次 push 发现，客户端换号、改写本地事件后重推。

### 3. 投影重建和未知事件策略已经产品化

LiveStore 的 schema 变化会新建 state DB 并重放 eventlog，支持重建批次大小、失败恢复和未知事件的 `warn`、`ignore`、`fail`、`callback` 策略。事件名也建议使用版本前缀，例如 `v1.TodoCreated`。

这套规则适合解决“客户端版本并行发布”和“读模型随产品演进”的问题。

### 4. 适用边界写得诚实

LiveStore 文档同时说明了什么时候适合、什么时候不适合，并给出「评估练习」：花几分钟列出应用的事件和派生表，写不顺就说明不适合。
它还明确写出 beta 状态、三类破坏性变化（API、客户端存储格式、同步后端存储格式）、内存 SQLite 容量（约 1GB 内）、单个 eventlog 的并发范围和 bundle 体积，降低了误用风险。
生产检查清单页面目前仍是 TBD。

### 5. 同步与启动的边角情况都有明确策略

- **远端身份**：后端首次创建时生成 `backendId`，客户端随事件日志保存；后端被重置后身份不匹配，按 `onBackendIdMismatch` 处理（默认 `reset` 清空本地库并关闭，另有 `shutdown`、`ignore`）。
- **启动可见**：启动按 loading → migrating → rehydrating → syncing → done 推送阶段；存储降级（如无痕模式没有 OPFS）作为 warning 交给应用。
- **开发态保护**：开发模式下迁移前把旧 state 库复制进 `archive/`，保留最近三份。
- **确定性守卫**：开发模式下比对 session 与 leader 两侧的物化结果哈希，不一致抛 `MaterializerHashMismatchError`，把「materializer 必须纯函数」从约定变成运行时检查。

### 6. 设计取舍和已知差距写成可追溯的台账

`context/` 下每个子系统有 intuition（心智模型）、requirements、spec 三层；`.decisions/` 的每份记录列出备选方案与否决理由，
`.delta/` 记录规格与实现之间的已知差距和关闭条件，`ontology.md` 规定术语并列出「避免使用」的近义词。
RFC 只是提案通道，接受后并入对应节点；文档站从这棵树派生。目录结构的不变量有测试守着，连「CI 吞掉这组测试的失败」本身也被记成了一条 delta。

## RxDB 已具备或领先的部分

以下能力 LiveStore 没有或仍在规划，借鉴时不要重复建设：

- **三框架对称**：Angular / React / Vue 同一套 hook 与插件绑定，并有三端 golden 语义对拍；LiveStore 没有 Angular，Vue 依赖社区包。
- **已有远端数据与海量数据**：Supabase 行同步（含 RLS）、`Filter` 子集同步、`QueryCache` 远端行缓存；LiveStore 要求事件日志从第一天起就是事实源，且全部数据装得进内存。
- **存储与宿主广度**：IndexedDB 默认持久化、PGlite、Electron `node:sqlite`、Tauri `rusqlite`、小程序；LiveStore 的 Web 端只支持 OPFS。
- **加密、搜索、文件、P2P**：LiveStore 均无内建，P2P 还与它的中心化总序设计直接冲突。
- **版本能力**：历史、撤销重做、分支、合并预览、工作树提交与回放；LiveStore 只有方向说明。
- **迁移发布纪律**：系统 schema 与 change codec 版本水位、桥接版本三道门与 `migration-release-gate`；LiveStore 靠重建投影和重置本地存储处理格式变化。
- **验证体系**：跨后端共享套件、DevTools 一致性套件、带阈值的性能门禁；LiveStore 把适配器与框架一致性套件、性能阈值记在自己的差距台账里。
- **面向 AI 的发布产物**：核心包附带 Agent Skill（[US-602](stories/tooling/US-602-ai-comprehensible-artifacts.md)），与 LiveStore 随包附带文档的做法等价。
- **本地 UI 状态**：[`usePersistedState`](../packages/rxdb-react/src/use-persisted-state.ts) 与[工作空间草稿缓存](../website/docs/plugins/rxdb-plugin-workspace/README.md)已覆盖 client document 的主要用途；LiveStore 自己的 RFC 0003 也在提议移除 client document API。

## 建议借鉴方向

优先级是针对现有同步与开发体验的相对判断，成本未经原型验证。

### P0：核实冲突裁决的时间语义

**推断**（读代码，未跑用例）：拉取冲突时，本地一侧取该实体最后一条未推送的变更，`createdAt` 是本机写入时刻；
远端一侧的 `createdAt` 来自推送方。[`build_merge_changes_payload`](../packages/rxdb-adapter-supabase/src/supabase.merge-changes.ts)
把每条待推变更的时间改写为推送时刻：

```ts
const now = new Date().toISOString();
```

服务端 [`rxdb_insert_changes`](../docker/sql/04-rxdb-utils-functions.sql) 原样落库，[`LWWConflictResolver`](../packages/rxdb/src/sync-contract/LWWConflictResolver.ts)
于是在比较「本机的写入时刻」与「另一台设备的推送时刻」：两个时钟、两种语义。离线较久的设备推送时，可能凭推送时间覆盖别人更晚的编辑；
[同步策略](../website/docs/collaboration/sync.md)里「较新的修改获胜」的说法与此不一致。

LiveStore 由后端串行处理 push 并分配全局序号，冲突胜负只看总序，不看任何客户端时钟。

最小验证：A、B 两个客户端，A 离线编辑、稍后推送，B 在两者之间编辑且未推送；断言 B 拉取后的结果与文档语义一致。结果出来后由 owner 拍板：

| 选项             | 做法                                                                                                  | 代价                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 以服务端顺序为准 | 远端变更按 `remoteId` 排序；本地待推变更视为排在已拉取的远端变更之后，与 LiveStore 的 rebase 语义一致 | 改变现有冲突结果，需要迁移说明                              |
| 保留编辑时间 LWW | 推送时保留原始 `createdAt`，再评估用混合逻辑时钟抵消时钟漂移                                          | 远端日志的时间含义改变，需核对依赖 `createdAt` 的历史与审计 |
| 维持现状         | 只改文档，如实写成「远端推送时刻晚于本地编辑时刻则远端胜」                                            | 不改代码，离线场景下的反直觉结果保留                        |

### P0：记录远端身份，处理远端重置

**推断**：拉取游标是远端 change id。[`pullChanges`](../packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts) 注明「使用 id 而非 createdAt 作为游标」，
[`RepositorySyncStatus`](../packages/rxdb-plugin-sync/src/get-repository-sync-status.ts) 保存 `lastPullRemoteChangeId`。
远端库重建后 id 从头计数，旧客户端的游标可能大于新库的全部 id，拉取静默返回空，本地也看不到错误。

借鉴 LiveStore 的 `backendId`：远端生成一个身份值，客户端与游标一起保存；不匹配时按显式策略处理（清空同步状态后全量拉取 / 停止同步 / 只读），
并经 `SyncState.lastError` 暴露。最小验证：重建 Supabase 测试库后，旧客户端拉取与推送的行为用例。

### P1：同步诊断进 DevTools

协议层已经具备（v2 协商、能力档位、授权与分块传输），缺的是检视内容。按价值排序：

1. 同步时间线：push / pull / 冲突 / 拒绝，数据来自 `SyncState` 与 `RepositorySyncStatus`；
2. 模拟离线开关（对应 LiveStore 的 sync latch），只在 `full` 能力档开放；
3. 活查询检视：当前订阅、执行次数与耗时；
4. 只读 SQL playground，加密字段照旧先遮罩；
5. 数据库导出导入，复用 US-217 备份恢复；
6. 开发态控制台入口：下载数据库、重置本地数据。

### P1：启动阶段与持久化方式可见

- 把连接过程拆成可观察的阶段：打开存储 → 系统迁移 → 应用迁移 → 首次同步，三端以同一形状读取；
- 暴露实际生效的持久化方式（选中的 VFS、是否持久），无法持久化时以明确状态告知 UI。[路线图](roadmap.md)已要求「不静默切换存储后端」，这一项是它面向用户的一面；
- 开发态在系统迁移前自动留一份快照（LiveStore 保留最近三份旧库），复用 US-217。

### P1：区分「收敛」与「正确」

LiveStore 的 [command replay RFC](https://github.com/livestorejs/livestore/blob/487b95e45461b5865686bd2e90a68a6601ae4971/contributor-docs/rfcs/0002-command-replay.md)
把问题说得很透：rebase 只保证各端收敛到同一状态，不保证业务不变量仍然成立。它举了三个场景：评论指向已删除的任务、房间超员、同一座位分给两人。

RxDB 的同步写入是事务级 fail-closed：实体拉取遇到 `MERGE` / `DEFER` 时整轮回滚、水位不推进（见 [`ConflictResolution`](../packages/rxdb/src/sync-contract/conflict.ts)）；
分支同步遇到外键无法满足时本地表整体不变（`branch-sync-atomicity.spec.ts` 的用例「批中有一条外键无法满足时，本地分支表整体不变」）。
**推断**：没有定义的是之后怎么继续。远端变更在本地违反约束时，同一条变更每轮都会再次失败，同步可能一直卡住。
建议先用这三个场景写双客户端用例钉住现状，再决定是隔离进[愿景](vision.md)里的「冲突中心」、交给应用处理，还是在推送端拦截。

### P1：选型说明与不适合场景

在 [compare](../website/docs/getting-started/compare.md)（目前只对比 rxdb.info）基础上扩展：

- RxDB、LiveStore、ElectricSQL、Zero、PowerSync 各自的事实源；
- 适合已有远端数据库还是新建事件系统；
- `Full`、`Filter`、`QueryCache` 以及将来事件模式的选择条件；
- 历史、分支、工作树和同步的边界；
- Web、桌面、小程序和移动端的适配器限制；
- 像 LiveStore 一样写明不适合的场景，并给一个评估练习：先写下应用的实体与同步范围，写不顺就说明不适合。

### P1：在同步领域试行决策记录与差距台账

- 决策记录列出备选方案与否决理由。现成素材有：LWW 为什么比较 `createdAt`、`MERGE` / `DEFER` 为什么 fail-closed、
  为什么不提供跨 realm 的 writer lease（见 [writer-lease-removal](../website/docs/migration/writer-lease-removal.md)）；
- 差距台账记录规格与实现的已知差距和关闭条件，与[能力矩阵](capability-matrix.md)「已知的需求覆盖缺口」互链，不另起一套状态。

是否推广到全仓，看试行后评审里「为什么这样设计」的重复追问是否减少。

### P2：先加领域意图，再评估事件原生模式（价值待证）

第一步只给事务附加可选的领域意图：版本化事件名与参数（如 `v1.TaskMovedToColumn`），与 [`RxDBChange`](../packages/rxdb/src/system/change.ts) 的 `transactionId` 关联。
它让「把任务移到下一列」与「更新 `columnId`」在日志里可以区分，可用于审计、活动流和 AI agent 的工具调用记录，事实源不变。

出现具名的审计、可重放或协作场景后，再评估候选包 `@aiao/rxdb-plugin-eventlog`，暂不替换实体模型。最小 API 可以围绕以下概念设计：

```ts
const events = {
  todoCreated: event('v1.TodoCreated', Schema.Struct({ id: Schema.String, text: Schema.String }))
};

const materializers = {
  'v1.TodoCreated': ({ id, text }) => tables.todos.insert({ id, text })
};

store.commit(events.todoCreated({ id, text }));
```

立项前必须验证：

- 事件定义、编码、版本和未知事件策略；
- 事件与投影写入的原子性；
- 同一 eventlog 重放得到相同快照；
- pending event rebase、重复提交和断线重试；
- eventlog 导出、导入、恢复和清理边界；
- 与现有实体、历史、加密字段和 DevTools 的关系；
- Angular / React / Vue 是否需要对称绑定，还是先提供框架无关 API。

这一步通过后，再决定是否支持事件驱动同步和云端事件存储。

事件模式的投影迁移沿用 LiveStore 的规则：

- 事件定义使用版本前缀；
- 只允许向前兼容的事件参数变化；
- projection schema 变化自动重建；
- 重建按事件批量提交；
- 中断后丢弃未完成投影并重试；
- 未知事件策略集中配置；
- 重建状态和失败原因暴露给框架层和 DevTools。

这不能替代 RxDB 现有 migration。普通实体继续使用显式 migration，事件模式使用 replay-based migration。

### P2：其余候选

| 候选                         | LiveStore 参照                                                                      | 入场信号                                                                                                             |
| ---------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 统一同步后端契约与一致性套件 | `SyncBackend` 围绕按游标 pull 与 push 两个操作，provider 套件用同一组用例跑全部实现 | 出现第二个支持 `Full` 同步的远端适配器。目前只有 Supabase，按「病灶数 ≥ 抽象数」暂不新增抽象；远端身份先按 P0 单独做 |
| 交互延迟与内存基线           | 仿 js-framework-benchmark 的场景，Event Timing API 与主线程堆内存                   | 核心读写路径出现可复现的卡顿，或准备对外做性能承诺                                                                   |
| OpenTelemetry 钩子           | 默认 no-op，由应用提供 tracer                                                       | 有生产部署需要追踪连接、迁移与同步                                                                                   |
| 运行时 MCP 工具              | 连接实例、只读 SQL、提交事件、同步导出导入                                          | 与 [Teable 调研](teable-research.md)的「保存查询与 MCP」合并评估                                                     |
| 首帧同步读取                 | 每个会话一份内存 SQLite 镜像                                                        | 三端列表的加载闪烁成为具体投诉；先评估内存成本                                                                       |
| Cloudflare 与 Expo 适配器    | DO 按 `storeId` 路由，DO SQLite / D1，WebSocket / HTTP 与重连；Expo 原生 SQLite     | 有目标用户、真实部署场景和宿主验收，不能仅因 LiveStore 已有文档就排期                                                |

## 不建议照搬的部分

1. **不把事件溯源变成所有应用的唯一模型。** LiveStore 自己也把已有数据库、高连接度社交业务和完全去中心化 P2P 列为不适合场景。RxDB 的实体关系、树、图和 QueryCache 仍应作为默认优势。
2. **不把总序 rebase 宣称为领域冲突解决。** LiveStore 当前同步文档明确写着 semantic merge 尚未实现。富文本、多人细粒度编辑和复杂业务规则仍需要 CRDT 或领域 resolver。
3. **不只押注 OPFS 和中心同步。** RxDB 的 Electron、Tauri、小程序、PGlite、Supabase、HTTP 和 P2P 组合是重要差异化。
4. **不把 client document 等同于业务实体。** UI 草稿、客户端状态、工作树和业务数据的持久化、同步、历史语义不同，必须分别定义。
5. **不把「每个标签页一份内存 SQLite」作为默认架构。** 同步读取的代价是每个会话一份内存副本、数据必须装得进内存，与 QueryCache 面向海量数据的定位冲突；首帧体验另找办法。
6. **不在公共 API 里绑定重型基础库。** LiveStore 的 schema 与 Store API 直接暴露 Effect 类型，0.4 → 0.5 升级要求所有 `@livestore/*` 包与 `effect@^4` 一起迁移，排障文档还专门处理多版本 Effect 并存的报错。RxDB 公开 API 已以 RxJS 为基础，新增能力不再引入同类耦合。

## 最小验证顺序

现有同步与工具：

| 顺序 | 验证项           | 最小结果                                                   | 未通过时的处理                         |
| ---- | ---------------- | ---------------------------------------------------------- | -------------------------------------- |
| 1    | 冲突时间语义     | 双客户端离线用例的结果与文档描述一致                       | 按 P0 的三个选项拍板，先改文档或改语义 |
| 2    | 远端重置         | 重建远端库后，旧客户端得到明确错误或按策略恢复，不静默拉空 | 实现远端身份与处理策略                 |
| 3    | 不变量冲突       | RFC 的三个场景都有双客户端用例钉住现状                     | 进入冲突中心的立项评估                 |
| 4    | DevTools 诊断    | 能定位一条变更从写入到被拒绝或被覆盖的完整链路             | 不扩大公共 API                         |
| 5    | 启动与持久化状态 | 三端能读到连接阶段与实际持久化方式                         | 先提供框架无关 API                     |

事件原生模式（若立项）：

| 顺序 | 验证项           | 最小结果                                                       | 未通过时的处理           |
| ---- | ---------------- | -------------------------------------------------------------- | ------------------------ |
| 1    | 事件提交与投影   | 断电 / 回滚后事件和投影保持一致                                | 不进入同步设计           |
| 2    | 事件重放         | 同一日志在至少两个本地适配器上得到相同快照                     | 先修事件编码和后端差异   |
| 3    | rebase 与重试    | 两客户端离线写入、交错 pull/push 后收敛                        | 不宣称协作完成           |
| 4    | schema evolution | 新旧事件并行、未知事件和投影重建可恢复                         | 只保留实验性 API         |
| 5    | DevTools 诊断    | 能定位一条事件从提交到同步失败的完整链路                       | 不扩大公共 API           |
| 6    | 三框架消费       | Angular / React / Vue 至少完成同一框架无关核心的读取和提交验证 | 事件模式继续保持框架无关 |

测试仍需遵守现有核心包 90%、其他包 80% 覆盖率门禁；事件模式应额外提供跨适配器、跨框架和重放一致性套件。

## 当前边界与风险

LiveStore 官方项目当前为 beta，minor release 仍可能包含 API、客户端存储格式或同步后端存储格式三类破坏性变化，暂无明确 1.0 时间表。
其 Web 适配器只支持 OPFS，依赖 SharedWorker 与 `navigator.locks`，官方建议开发期也用 HTTPS；JS 约 180KB、SQLite WASM 约 300KB（gzip）；Expo Web 与 Next.js 尚不支持。
官方建议应用数据能放进内存 SQLite（约 1GB 内）；同步场景面向同一 eventlog 上的几十到低几百并发用户，横向扩展靠拆分多个 store。
语义冲突合并、eventlog compaction、多 eventlog 分区、生产检查清单和部分框架 / 平台支持仍在演进；0.5 起依赖 Effect 4。

因此本文只把 LiveStore 的同步语义、诊断工具、确定性守卫、事件建模和设计记录方法当作学习对象，不把其 beta 状态下的未完成能力写入 RxDB 的交付承诺。

## 后续决策入口

1. 先补 P0 的两组用例（冲突时间语义、远端重置），owner 依据结果在时间语义的三个选项中拍板。
2. P1 各项按 [CONVENTIONS](CONVENTIONS.md) 分别建 story；DevTools 与启动状态涉及三端绑定时按对称要求验收。
3. 事件原生模式没有具名场景前不开公共包；若确认，story 写清事件格式、迁移策略、同步后端和三框架边界，
   并把协议一致性、重放一致性和故障恢复列为准入条件，不以 Todo demo 代替验证。
4. 相关 `packages/*` 公共包改动按 [AGENTS.md](../AGENTS.md) 一起评审、验证和合入。

## 来源与复核方式

| 编号 | 官方来源                                                                                                                                                                               | 核对内容                                                                                          |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| L01  | [LiveStore GitHub 仓库](https://github.com/livestorejs/livestore)                                                                                                                      | 项目定位、README 能力清单、主仓包清单、Apache-2.0 许可                                            |
| L02  | [How LiveStore works](https://docs.livestore.dev/overview/how-livestore-works/)                                                                                                        | event sourcing、SQLite 投影、push/pull、rebase、LWW                                               |
| L03  | [When to use LiveStore](https://docs.livestore.dev/overview/when-livestore/)                                                                                                           | 适用场景、已有数据库边界、容量与并发考虑                                                          |
| L04  | [Technology comparison](https://docs.livestore.dev/overview/technology-comparison/)                                                                                                    | 与状态管理、BaaS 和既有数据库同步方案的定位差异                                                   |
| L05  | [Events](https://docs.livestore.dev/building-with-livestore/events/)                                                                                                                   | 事件定义、版本、client-only、事件流和事件格式                                                     |
| L06  | [Syncing](https://docs.livestore.dev/building-with-livestore/syncing/)                                                                                                                 | 总序、cursor、head、rebase、backend reset、未完成语义合并                                         |
| L07  | [SQLite state schema](https://docs.livestore.dev/building-with-livestore/state/sqlite-schema/)                                                                                         | 表定义、materializer、schema migration、state rebuild                                             |
| L08  | [SQL queries](https://docs.livestore.dev/building-with-livestore/state/sql-queries/)                                                                                                   | 查询构建器、原生 SQL、结果 schema和性能边界                                                       |
| L09  | [DevTools](https://docs.livestore.dev/building-with-livestore/devtools/)                                                                                                               | 数据浏览、eventlog、查询检查器、SQLite playground、导入导出、Chrome 扩展                          |
| L10  | [Cloudflare Workers](https://docs.livestore.dev/sync-providers/cloudflare/)                                                                                                            | Durable Objects、DO SQLite / D1、WebSocket / HTTP / DO RPC transport、`validatePayload`           |
| L11  | [Web adapter](https://docs.livestore.dev/platform-adapters/web-adapter/)                                                                                                               | OPFS、Worker、SharedWorker、`storageMode`、单标签页降级、bundle 体积                              |
| L12  | [State of the project](https://docs.livestore.dev/misc/state-of-the-project/)                                                                                                          | beta 状态、三类破坏性变化、路线图和未完成平台                                                     |
| L13  | [Store](https://docs.livestore.dev/building-with-livestore/store/)                                                                                                                     | 同步状态 API、`_dev` 调试入口、shutdown 语义                                                      |
| L14  | [React integration](https://docs.livestore.dev/framework-integrations/react-integration/)                                                                                              | StoreRegistry、Suspense、多 store、`useSyncStatus`                                                |
| L15  | [Design decisions](https://docs.livestore.dev/understanding-livestore/design-decisions/)                                                                                               | 主要设计决策及决策记录链接                                                                        |
| L16  | [`context/` 意图层](https://github.com/livestorejs/livestore/tree/487b95e45461b5865686bd2e90a68a6601ae4971/context)                                                                    | `ontology.md`、各子系统 spec 与 `.decisions/`、verification（一致性、确定性、性能）及其 `.delta/` |
| L17  | [RFC 0002 Command Replay](https://github.com/livestorejs/livestore/blob/487b95e45461b5865686bd2e90a68a6601ae4971/contributor-docs/rfcs/0002-command-replay.md)                         | rebase「收敛不等于正确」的三个场景与提案                                                          |
| L18  | [RFC 0003 Remove Client Document API](https://github.com/livestorejs/livestore/blob/487b95e45461b5865686bd2e90a68a6601ae4971/contributor-docs/rfcs/0003-remove-client-document-api.md) | 提议移除 client document 的理由                                                                   |
| L19  | [CLI](https://docs.livestore.dev/building-with-livestore/tools/cli/)、[MCP](https://docs.livestore.dev/building-with-livestore/tools/mcp/)                                             | 实验性 CLI 与 MCP 工具清单                                                                        |
| L20  | [OpenTelemetry](https://docs.livestore.dev/building-with-livestore/opentelemetry/)                                                                                                     | 默认 no-op tracer、由应用提供 provider                                                            |
| L21  | [性能测试说明](https://github.com/livestorejs/livestore/blob/487b95e45461b5865686bd2e90a68a6601ae4971/tests/perf/README.md)                                                            | 交互延迟与内存的测量方法                                                                          |
| L22  | [Upgrading 0.4 → 0.5](https://docs.livestore.dev/misc/upgrading-0.4-to-0.5/)                                                                                                           | Effect 4 依赖簇整体升级、一次性状态重建                                                           |
| L23  | [livestore-contrib](https://github.com/livestorejs/livestore-contrib)                                                                                                                  | Node、Expo、Solid、Svelte、ElectricSQL、S2、CLI 等包的归属                                        |

后续立项前，应重新核对 LiveStore 文档版本、npm 包能力和实际运行行为；本文不以宣传页或单个 demo 推导性能、可靠性或生产适用性。
