# livestore-research.md 评审意见

> 评审日期：2026-11-10。评审对象：[livestore-research.md](./livestore-research.md)（live-store 分支）。
> 评审方式：仓库内引用路径与关键代码断言逐条读码核实；LiveStore 一侧按文档固定的提交
> `487b95e45461b5865686bd2e90a68a6601ae4971`（= main 头部，2026-11-09）经 GitHub API 取文档、源码与
> `context/` 设计记录原文核对；个别出处用 GitHub 代码搜索定位。
> 本文是对 livestore-research.md 的评审意见，不是对它的修改版。

## 总体结论

**没有发现事实性错误。** 仓库内 32 个引用路径全部存在；P0 两条「推断」涉及的代码逐行读过；
LiveStore 一侧 30 余条声明与固定提交原文逐条对上，v0.5.0 也确为最新 release（2026-10-15 发布）。
「源码实证 / 文档声明 / 推断」三分法执行到位，可作为后续立项依据。问题只在「标注层级」与
「出处定位」级别（第二节 5 条），另有值得补充的维度（第三节 7 条）。

## 一、核对通过的关键断言（选列证据）

### RxDB 侧（读码确认）

- **P0-1 的核心事实成立**：[`LWWConflictResolver.ts:39-56`](../packages/rxdb/src/sync-contract/LWWConflictResolver.ts)
  确实比较两侧 `createdAt`、平局按 `clientId` 字典序、缺失时退回本地；
  [`supabase.merge-changes.ts:70`](../packages/rxdb-adapter-supabase/src/supabase.merge-changes.ts)
  确实无条件 `const now = new Date().toISOString()` 并用于每条变更的 `createdAt`；
  [`docker/sql/04-rxdb-utils-functions.sql`](../docker/sql/04-rxdb-utils-functions.sql) 的
  `rxdb_insert_changes` 原样落库。「远端一侧比较的是推送时刻」是字面代码，不是推断。
- **P0-2 的游标部分成立**：[`RxDBAdapterSupabase.ts:307`](../packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts)
  注释原文即「使用 id 而非 createdAt 作为游标」；
  [`get-repository-sync-status.ts:71`](../packages/rxdb-plugin-sync/src/get-repository-sync-status.ts)
  确有 `lastPullRemoteChangeId`。
- **`MERGE`/`DEFER` 的 fail-closed 语义成立**：整轮回滚、水位不推进、派发 `ConflictPendingEvent`、
  `Conflict.base` 已声明但同步拉取不填，与
  [`conflict.ts:36-45`](../packages/rxdb/src/sync-contract/conflict.ts) 注释一致。
- **工作树侧成立**：`CommitKind` 三种、`parentIds`「merge 可多父」注释
  （[`commit.entity.ts:106`](../packages/rxdb-plugin-working-tree/src/commit/commit.entity.ts)）、
  `assertSyncOnMainCheckout`（[`sync-manager.utils.ts:63`](../packages/rxdb-plugin-sync/src/sync-manager.utils.ts)）、
  拉取落地 `origin='remote_sync'` 单元（[`pull-batch.ts:351`](../packages/rxdb-plugin-sync/src/pull-batch.ts)）。
- **迁移门禁成立**：`down()` 预留不调用（[`rxdb.interface.ts:43`](../packages/rxdb/src/rxdb.interface.ts)）、
  「系统 schema 或 change codec 高于自身版本拒绝连接」
  （[`schema.md:35`](../website/docs/migration/schema.md)）、桥接版本三道门
  （`scripts/check-migration-release-gate.mjs`）。
- **HTTP 适配器只支持 QueryCache 成立**：[`rxdb-adapter-http/src/index.ts:4-5`](../packages/rxdb-adapter-http/src/index.ts)
  写明「changelog / 分支同步（Full、Filter）一律 unsupported throw」。
- 其余抽查均属实：`RxDBChange.transactionId`、三端 `useSyncState`、`RxDBResource.isLoading`、
  DevTools 能力档 `none/readonly/full` 与单实例限制、Web Locks + BroadcastChannel 网关、
  wa-sqlite 默认 `IDBBatchAtomicVFS`（IndexedDB）、Supabase RLS 与逐实体回执（`p_receipts`）、
  FTS5 / pg 搜索、字段级加密、`rxdb-plugin-storage` 文件存储与 `rxdb-plugin-p2p` 文件共享、
  US-216/217/314/602 故事与 `branch-sync-atomicity.spec.ts` 均存在。

### LiveStore 侧（对照固定提交原文）

- **状态类**：beta、无 1.0 时间表、三类破坏性变化、生产检查清单 TBD、eventlog compaction 与
  Electron/Tauri 原生适配器仍在 roadmap——均在 `misc/state-of-the-project.md`。
- **同步类**：先 pull 后 push、后端全局总序、pending rebase、`backendId` +
  `onBackendIdMismatch`（reset/shutdown/ignore）、clientId 撞号换号重推、
  `EventSequenceNumber.rebaseGeneration`、语义合并未实现（#253）、RFC 0002 三个场景
  （评论指向已删任务 / 房间超员 / 座位双分）与文档转述逐字一致。
- **运行类**：OPFS-only、leader worker（web locks）、Android Chrome 无 SharedWorker 自动单标签降级、
  无痕退内存 + `storageMode`、archive 保留三份、~180KB JS + ~300KB SQLite WASM gzip、HTTPS 建议、
  启动五阶段 `loading → migrating → rehydrating → syncing → done`（runtime spec:106-107）、
  `MaterializerHashMismatchError` 存在于源码与确定性 spec。
- **工程类**：未知事件 `warn/ignore/fail/callback` 集中配置（events.mdx）、
  `__debugLiveStore.<storeId>._dev` 四个方法、`SetSyncLatch` 模拟离线（协议目录 +
  `networkStatus.devtools.latchClosed`）、OpenTelemetry no-op 默认、CLI/MCP 标 experimental、
  Effect 4 全包队列迁移与「勿混 0.4」、排障文档确有「多版本 effect 并存」条目。
- **边界类**：1GB 内存容量、「10s / low 100s 并发用户、多 eventlog 横向扩展」、评估练习、
  已有数据库不适用、无托管后端、主仓只有 React 包（Solid/Svelte/Expo/Node/CLI/ElectricSQL/S2 全在
  contrib）、无 Angular、Vue 是社区包（beta）、Expo Web 不支持（#130）、Next.js 不支持、
  7 个 provider 实现（conformance spec 原文「Registry (7 providers): `mock`, …」）。
- **设计记录类**：`context/` 的 intuition/requirements/spec 三层、`.decisions/`、`.delta/`、
  ontology 的「_Avoid:_」近义词清单均属实；`DELTA-002` 的内容就是「CI 的 `Effect.ignore` 吞掉了
  意图层门禁套件的失败」；verification 子系统三个 delta（框架一致性套件、确定性 oracle、性能阈值
  均未建）与文档说法一字不差。

## 二、建议修正的小问题（均不影响结论）

1. **P0-1 应从「推断」升级为「源码实证」。** `createdAt` 被改写为推送时刻是字面代码事实。
   真正仍属推断的只有后果链（离线久推的设备可能凭推送时间覆盖别人更晚的编辑），建议把标注
   收窄到这一句，让 P0 的依据更硬。
2. **来源表 L12 出处定位有偏移。** 「Expo Web 与 Next.js 尚不支持」不在 state-of-the-project 里：
   Expo Web 写在 `getting-started/expo.mdx`（引用 #130），Next.js 写在
   `framework-integrations/react-integration.mdx:291`。建议把这两条挂到对应页面。
3. **LiveStore 文档自身有一处矛盾，值得在来源表加注。** `overview/how-livestore-works.mdx` 声称
   「默认 LWW，并支持开发者自定义 merge 冲突解决逻辑」，`building-with-livestore/syncing.mdx`
   却明说「merge conflict handling 尚未实现（#253）」。文档采用了后者（正确选择），但若不标注，
   下次按版本重新核对的人会被前者误导。
4. **「wa-sqlite OPFS 实验性」措辞建议调整。** 默认 VFS 确实是 IndexedDB（`IDBBatchAtomicVFS`），
   OPFS 系 VFS 也确实存在，但代码里没有「实验性」字样——这是判断而非标注，建议改为「OPFS 可选」
   或注明判断依据。
5. **DevTools「模拟离线开关」的出处可以写得更准。** 它不在 DevTools 文档的功能清单页，而在协议
   目录（`SetSyncLatch.Request`「simulate offline」）与 `patterns/offline.mdx` 里实现。表述成立，
   建议把出处从 DevTools 页改为这两处。

## 三、建议补充的内容

1. **celld 自托管运行时。** cf-spec 有「Self-Hosted Runtime (celld)」段，2026-10-02 对 celld
   v0.6.1 验证过全部 provider 套件与故障恢复。「必须中心后端」不等于「必须买 Cloudflare」——
   平台行和「不建议照搬 #3」都可以加一句，边界会更准。
2. **团队与可持续性维度。** FAQ 写明核心维护者是 Johannes Schickling、无托管后端、靠赞助与商业
   许可、DevTools 免费；仓库 3754 stars。「当前边界与风险」目前没有 bus factor 视角，建议补一行。
3. **事务维度。** LiveStore FAQ 明确没有全局事务（materializer 的事务是局部的，「online
   transactions」需应用自行建模）；RxDB 有跨实体事务。对照表「写模型/读模型」行提了 materializer，
   但事务语义值得单列一行，它和 P1「违反约束停在合并状态」的校验位置也直接相关。
4. **鉴权维度。** LiveStore 把 auth/多租户压给 per-connection `payload` + `validatePayload`
   （cf-spec 原文），RxDB 靠 Supabase RLS——两边都没有内置用户体系，边界相当，可以补一行，
   免得误以为有一边「内建鉴权」。
5. **eventlog 无 compaction 与 pending 无上限的组合风险。** 离线久的客户端不仅 rebase 放大，
   本地事件日志也会无限增长（compaction 还在 long-term roadmap）。「不建议照搬 #1」可顺带提一句。
6. **P0 验证可以立刻做。** 两个 P0 的最小验证都是纯双客户端用例，且第一项的核心事实已读码确认，
   不依赖任何 story 化前置——按文档日期当天就能跑，建议把「先补用例、owner 拍板」直接排到最前。
7. **重新核对时的版本锚定。** LiveStore 有 docs.livestore.dev 与 next.livestore.dev 两个文档地址，
   核对时以 docs 为准并继续带 commit 锚定（这次的做法就是对的）。

## 来源

- [LiveStore 主仓（固定提交 487b95e4）](https://github.com/livestorejs/livestore/tree/487b95e45461b5865686bd2e90a68a6601ae4971)
- [livestore-contrib](https://github.com/livestorejs/livestore-contrib)
- [vue-livestore (npm)](https://www.npmjs.com/package/vue-livestore)、[slashv/vue-livestore](https://github.com/slashv/vue-livestore)
- [LiveStore Vue 集成文档](https://docs.livestore.dev/framework-integrations/vue-integration/)
