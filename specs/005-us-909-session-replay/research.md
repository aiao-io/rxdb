# Research: US-909 阶段 C — 应用内会话录制回放与 commit 关联

**Date**: 2026-10-02 | **Plan**: [plan.md](plan.md) | **Spec**: [spec.md](spec.md)

决策编号 D1–D13。带「owner」的是用户 2026-10-02 的裁决，其余按建议冻结。

## D1 依赖：直接依赖 `rrweb@2.1.6` + `@rrweb/types@2.1.6`，按需加载

**Decision**: `@aiao/rxdb-plugin-replay` 的 `dependencies` 写 `"rrweb": "2.1.6"`、`"@rrweb/types": "2.1.6"`（无 `^`）。
`rrweb` 只经 `await import('rrweb')` 在 `start()` 与 `mountReplayer()` 里加载；包内对 `rrweb` 的静态引用只有 `import type`。
回放样式 `rrweb/dist/style.css` 由视图在挂载时注入一份内联 `<style>`（只含 `.replayer-wrapper` / `.replayer-mouse` 那几条），
不要求应用改构建配置。

**Rationale**: `rrweb@2.1.6` 是 MIT、ESM，导出 `.` 与 `./dist/style.css`，一个包同时给出 `record` / `Replayer` / `EventType`。
`@rrweb/record`、`@rrweb/replay` 只是对 `rrweb ^2.1.6` 的再导出，依赖它们钉不住实际执行的那份代码。`rrweb` 自己对 `rrdom` /
`rrweb-snapshot` / `@rrweb/types` / `@rrweb/utils` 写的是 `^2.1.6`，由仓库的 `pnpm-lock.yaml` 钉死；应用侧的锁文件同理。
`@rrweb/types` 单列是因为公开类型（`eventWithTime`）要从它导出，而 `EventType` 的数值在运行时需要时从 `rrweb` 动态模块取。

**Alternatives**: `^2.1.6`（宪法：新依赖须钉版本，FR-023）；把 `rrweb` 设为 peer（应用要自己装且版本由应用决定，录制格式与回放器
可能不匹配）；`@rrweb/record` + `@rrweb/replay`（见上）。

## D2 事件流位置：独立录制库，工厂注入（owner）

**Decision**: 插件选项 `createRecordingDb(entities)`：插件把自己的两个实体类交给工厂，工厂返回一个**未 init 或已 init** 的 `RxDB`；
插件在第一次需要存储时（`start()`、`listSessions()` 等任一存储调用）`await` 工厂、`init()`（未 init 时）、`connect()`，结果缓存到本纪元。
作用域释放时：停录制 → 冲刷缓冲 → `destroy()` 录制库。插件不依赖任何适配器包。

**Rationale**: 事件流不进被录应用库，工作树捕获天然看不见它（AC#12），应用库的体积、同步、备份也不受影响。工厂由应用提供，
存储后端随应用选（demo 用主线程 IDB，node 测试用 PGlite memory），插件不需要知道。懒建库让「装了插件但从不录制」的应用
不建库、不占存储。

**Alternatives**: 写进被录应用库并给工作树加排除表（owner 否决：要动捕获层，且事件流随应用库同步出去）；插件内置 IDB 存储
（绑死后端，node 测不了）。

## D3 数据模型：每事件一行 + 会话行

**Decision**: 实体 `ReplaySessionRecord`（`replay_session`）与 `ReplayEventRecord`（`replay_event`），namespace `replay`，`log: false`、
`sync: { type: SyncType.None }`。事件行主键 `${sessionId}:${seq}`，`data` 用 `PropertyType.json` 存整条 rrweb 事件，索引
`(sessionId, seq)` 唯一、`(sessionId, timestamp)`。字段与规则见 [data-model.md](data-model.md)。

**Rationale**: 故事 AC#11 要求每事件一行、按批写、按会话 + 时间区间读命中索引。主键由 `sessionId` 与 `seq` 合成，重复写入同一
`seq`（刷新续录时的重放）在主键上就被拒，不需要额外查重。`bytes` 存在每行上，删除会话和统计用量不必再序列化。

**Alternatives**: 每会话一行、事件数组塞一个 JSON 列（每批都要读改写整列，16 MiB 时不可接受）；按批一行（读区间要拆批、
上限判定粒度变粗）。

## D4 上限：写事务内判定，超限截断（owner 数值）

**Decision**: 默认 `sessionBytes = 16 MiB`、`storeBytes = 128 MiB`，按 `JSON.stringify(event)` 的 UTF-8 字节计。每批在**一个写事务**里：

1. 读本会话行与全部会话行的 `bytes` 合计（会话数几十级，JS 求和）；
2. `session.bytes + batchBytes > sessionBytes` → 截断，code `session_limit`；
3. 否则 `total + batchBytes > storeBytes` → 截断，code `store_limit`；
4. 否则 `saveMany` 事件行并更新会话行（`bytes` / `eventCount` / `nextSeq` / `lastEventAt`）。

截断 = 这一批一条都不写，只在本批首个 `seq` 上写一条 `rxdb-replay:truncated` 标记（`{ code, limitBytes }`），会话状态改
`truncated`、`truncatedCode` 写 code；录制器随即停 rrweb、丢弃缓冲、清刷新暂存。标记本身的字节计入 `bytes`，所以「上限 +
一条标记」是总量的硬上界（SC-005 的「一批」余量更宽）。

`start()` 在建会话的同一个事务里判定：合计 `≥ storeBytes` → 抛 `RxDBReplayError('store_limit')`，不建会话。绝不自动删除；
`deleteSession()` 删事件行与会话行后合计即减少。

选项校验在插件构造时：两个值必须是正的安全整数且 `sessionBytes ≤ storeBytes`，否则抛 `RangeError`（FR-014，不纠正）。

**Rationale**: 判定与写入同在一个事务里，两个标签页并发写同一个录制库时，后到的那笔事务读到的合计已包含先到那笔，不会双双
越线（多标签页边界，plan 偏离 3）。整批拒写而不是拆批写到刚好满：拆批要逐条累加、半批状态还得另记，换来的只是少丢不到一批的
尾巴，而截断本来就意味着这段会话不完整。

**Alternatives**: 只在内存里计数（两个标签页各算各的，总量必然越线）；超总量时删最旧会话（owner 明令禁止）。

## D5 批写入、`seq` 与刷新续录

**Decision**:

- **缓冲与批**：rrweb `emit` 时立刻给事件分配 `seq`（会话内计数器）并算 `bytes`，进内存缓冲。缓冲达到 `flush.maxEvents`（默认 200）
  或距上次冲刷 `flush.intervalMs`（默认 1000 ms）时冲刷；同一时刻至多一笔冲刷在途，在途期间新事件继续进缓冲。
- **`stop()`**：停 rrweb → 等在途冲刷 → 冲刷剩余缓冲 → 会话行状态 `stopped`。任一步失败：状态 `error`、`stop()` 抛出原因，不重试
  （FR-010）。
- **写失败**：冲刷失败即停录制、`state$` 进 `error`，会话行保持 `recording`（DB 已不可写，不再尝试改它）。
- **刷新续录**：`pagehide` 时同步写 `sessionStorage['rxdb-replay:active:<应用库名>'] = { sessionId, nextSeq, events }`，`events`
  是在途批 + 缓冲（各带 `seq`）。插件下一次安装时读到它：立刻删键（认领），读会话行的 `nextSeq`，把暂存里 `seq ≥ nextSeq` 的
  事件按 D4 写入，计数器从 `max(暂存 nextSeq, 会话 nextSeq)` 续，再对同一会话重新 `record()`（rrweb 会先发一条全量快照）。
- **暂存失败**：完整暂存 `setItem` 抛（配额）时改写最小暂存 `{ sessionId, nextSeq, events: [], gap: true }`；续录时先在会话
  `nextSeq` 上写一条 `rxdb-replay:gap` 标记再续。最小暂存也写不进去时，会话停在 `recording`，与关掉标签页同（边界场景）。
- **bfcache**：`pageshow` 且 `persisted` 时删键，内存里的录制器原样继续。

**Rationale**: 一批一个事务，`nextSeq` 与事件行同进同退，所以「在途批到底落没落」只看会话行的 `nextSeq` 就知道，暂存里重叠的
那段按 `seq` 过滤即可，主键兜住任何遗漏的重复。`pagehide` 里不能等异步写库，`sessionStorage` 是唯一同步且随标签页的存储；
键只在离开时写、恢复时立刻删，复制标签页（复制 `sessionStorage`）不会让两个页面续同一个会话。

**Alternatives**: `beforeunload` 里同步写 IDB（做不到）；不续录、刷新即开新会话（AC#11 要求跨刷新 `seq` 单调）；用 `localStorage`
（多个标签页共享，会被别的标签页认领）。

## D6 脱敏默认

**Decision**: `record` 选项透传 rrweb 的 `maskAllInputs`（默认 `true`）、`maskInputOptions`、`maskTextSelector`、`maskTextClass`、
`blockSelector`、`blockClass`、`ignoreSelector`；另外固定 `blockSelector` 合并 `[data-rxdb-replay-block]`，让应用不懂 rrweb 也能
标记敏感区块。不透传 `emit` / `plugins` / `hooks`（由插件持有）。

**Rationale**: 默认遮蔽输入是录制工具的行业惯例（AC#16）；透传而不是重新定义一套选项，应用可以照 rrweb 文档配。

## D7 commit 挂点：门面 `commits$`（owner）

**Decision**: `WorkingTreeManager` 加实例字段 `readonly commits$: Observable<WorkingTreeCommitEvent>`，`WorkingTreeCommitEvent =
{ readonly commitId: string; readonly branchId: string }`。`commit()` 在 `runEnabled()` 返回之后（事务已提交、捕获自愈已排上）且
**本次确实写了新 commit** 时发一次。判定靠内部函数 `runCommitWorkingTree()` 的返回值 `{ result, written: { commitId, branchId } | null }`；
`commitWorkingTree()` 保持原签名，是它的薄包装。

不发的情形：CAS 冲突（`ok: false`）、事务回滚（异常）、幂等重放（`reused`，没有新节点）、基线 commit（`enable` 迁移与建分支，
不经 `commit()`）。

订阅者异常隔离：RxJS 7 的 `Subscriber` 自己截住回调里抛的错，转交 `config.onUnhandledError`（缺省异步重抛），不打断 `next()` 的调用方与其他订阅者——`commit()` 的结果与之无关。门面不另包 try/catch（包了也抓不到）。

**Rationale**: 门面是工作树对外的唯一入口，录制插件订阅它不需要知道表结构；只在「事务已提交」之后发，订阅者看到的 commit
一定能被 `listCommits()` 读到。实例字段而不是原型 getter：`facade-capability-gate` 测试要求受管成员之外的成员是实例字段
（门禁不包装它，订阅不触发 `runEnabled`）。

**Alternatives**: 订阅 `RxDBChange` 里的 commit 表写入（按表结构反推语义，基线也会触发）；录制插件按时间戳轮询 `listCommits()`
（故事明令不按时间反查）。

## D8 从标记恢复

**Decision**: `rxdb.replay.restoreToCommit(commitId)`：`rxdb.getPlugins('workingTree')` 为空 → 抛 `RxDBReplayError('working_tree_unavailable')`；
否则 `status()` 取新鲜凭据（`branchId` / `activationRevision` / `headRevision` / `workingTreeRevision`）→ `restore({ commitId }, …)`，
原样返回 `WorkingTreeRestoreResult`。导出纯函数 `replayRestoreHint(reason)`，四种拒绝各一句英文提示：

| `reason`              | 提示                                                                              |
| --------------------- | --------------------------------------------------------------------------------- |
| `conflict`            | The working tree changed while restoring. Try again.                              |
| `dirty_working_tree`  | There are uncommitted changes. Commit or discard them before restoring.           |
| `incompatible_schema` | This commit was written by an incompatible schema version and cannot be restored. |
| `unreachable_target`  | This commit is not on the current branch history.                                 |

**Rationale**: 恢复的语义与拒绝全在工作树里，录制插件只负责拿凭据与给提示；凭据取自恢复前那一刻的 `status()`，用户看回放时
工作树可能已经变了，旧凭据必然冲突。提示用英文，与库的公开错误文案一致；应用要本地化就按 `reason` 自己映射。

## D9 回放视图：core 的 `mountReplayer()`

**Decision**: `mountReplayer(host, options)` 在 `host` 里渲染整个回放器并返回句柄 `{ update, play, pause, seek, destroy }`。DOM：

- 根 `div.rxdb-replayer`，`data-state = loading | empty | error | ready`；加载中 `aria-busy="true"`；
- 错误：`div[role=alert]`，含错误消息；空：`p`「No events to replay」；
- 就绪：播放 / 暂停 `button`（`aria-pressed`）、`input[type=range][aria-label=Timeline]`（单位 ms，`aria-valuetext` 为 `mm:ss`）、
  commit 标记列表（`ul[aria-label="Commits"]` 里每个标记一个 `button`，文本 = `commitId` 前 8 位 + 时刻）、恢复结果
  `div[role=status][aria-live=polite]`、rrweb 回放根；
- 标记按钮：先 `seek` 到标记时刻并暂停，再调 `restoreToCommit()`，结果写进状态区（成功写「Restored N changes」，拒绝写提示）
  并经 `onCommitRestore` 回调给宿主；
- 播放中用 `requestAnimationFrame` 读 `getCurrentTime()` 更新滑块与 `onTimeChange`。

加载 = `readEvents(sessionId)` 全量 + `import('rrweb')`；事件少于 2 条或没有全量快照 → 空态。`update({ sessionId })` 换会话即
销毁旧 `Replayer` 重新加载；`destroy()` 取消 rAF、销毁 `Replayer`、清空 `host`。

**Rationale**: rrweb `Replayer` 本来就要一个宿主 DOM 节点并自己管理 iframe；把时间轴、标记、四态也放在同一处，三框架挂的是同一份
DOM，「视觉一致」由构造保证（plan Complexity Tracking）。全量读事件：跳转到任意时刻需要之前的全量快照，按区间读会丢快照。

## D10 三框架封装与 parity

**Decision**: 三个包各导出一个组件，只做三件事：把宿主元素交给 `mountReplayer()`、把输入变化转成 `update()`、把句柄的命令与回调
暴露成框架习惯的形式（契约表见 [contracts/replayer-component.md](contracts/replayer-component.md)）。core 的 `./testing` 子路径导出
`replayerParityCases`：一组「给定输入 → 期望 `mountReplayer` 调用 / `update` 调用 / 回调转发」的用例，三个包的组件测试各跑一遍
（`mountReplayer` 打桩）。

**Rationale**: 封装层是唯一可能分岔的地方，同一份用例在三端跑，任何一端漏转发、改名都会红。

## D11 demo 与 e2e

**Decision**:

- 开关：`localStorage['rxdb-demo-replay-enabled'] === '1'` 才录制，默认关。`/replay` 页上有开关按钮（写键后 reload）、会话列表、
  删除按钮、`<ao-replayer>`。
- 打开时 `setup_rxdb_sqlite-wasm.ts` 在 `db.init()` 之后 `await import('./replay-recording')`，后者 `db.use(rxDBPluginReplay(db, {
createRecordingDb: entities => createReplayRecordingDb(\`${dbName}-replay\`, entities) }))`；录制库 = 主线程 IDB sqlite-wasm、
`multiInstance: false`、不装任何插件。关闭时这两个模块都不加载、录制库不建（FR-022）。
- 页内测试 API `window.__rxdbReplay = { replay, dbName }`（仿阶段 B），e2e 用它直接驱动 `start` / `stop` / `listSessions`。
- e2e `replay.spec.ts`（8200 强制 IDB 档）：
  - AC#10/11：开录 → 建两条 Todo → reload → 再建一条 → `stop()`；`readEvents` 的 `seq` 严格递增且跨刷新连续（或只差一条 `gap`），
    会话状态 `stopped`；
  - AC#12：录制前后 `workingTree.status().entryCount` 只随 Todo 增加，与「不开录制」的对照相同；
  - AC#13/14：开录 → 建 Todo A → commit → 建 Todo B → commit → `stop()`；两个 commit 标记的 `commitId` 与 `listCommits()` 顺序一致；
    回放页选会话，T 取**第一个标记的时间戳**，seek 后回放 iframe 里有 A、没有 B；点第一个标记 → 状态区「Restored」；
  - AC#16：输入框里敲的字在回放 iframe 里是遮蔽字符；带 `data-rxdb-replay-block` 的区块是占位块。

**Rationale**: T 取标记时间戳而不是墙钟，用例不依赖机器快慢（宪法 II 确定性）。第一个 commit 发生在 B 建出来之前，所以 T 时刻
页面上必然只有 A。

## D12 性能量法

**Decision**: core 里一个基准用例 `store.bench.spec.ts`（PGlite memory），`it.runIf(process.env['REPLAY_BENCH'] === '1')`——
默认 CI 不跑，避免机器抖动让门禁变随机：200 条 ~200 B 事件一批，预热 3 批后连写 30 批，取中位数断言 < 100 ms（SC-007），
实测数记进 tasks。包体积：仓库没有包级体积门禁，不为此新建门禁；`nx build` 后用 esbuild 把 `dist/index.js` 打成单文件（`rrweb` / `@rrweb/*` /
`@aiao/*` / `rxjs` 外置、minify）再 gzip，量出的数记进 tasks 验证项与故事实现记录（命令见 [quickstart.md](quickstart.md)）。

## D13 新包注册点

新包逐一登记：`tsconfig.base.json` paths、根 `tsconfig.json` references、`.github/codecov.yml`、`scripts/audit/coverage-baseline.json`、
`scripts/ci/plan-test-lanes.mjs` WEIGHTS、`scripts/commitizen.mjs` scopes、`website/`（typedoc 入口、sidebars、flatten-api-docs、
插件指南、`compatibility.md`）、根 `README.md` 包树、`requirements/api-baseline/*.json`、demo app 的 tsconfig references。
实现时先 `grep -rn "rxdb-plugin-search-vue"` 找全部登记处再逐个补，不凭记忆。
