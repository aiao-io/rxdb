# Research: US-909 阶段 B — e2e 失败现场数据归档与导入

**Date**: 2026-10-02 | **Plan**: [plan.md](plan.md) | **Spec**: [US-909](../../requirements/stories/future/US-909-session-replay-debugging.md)

决策编号 D1–D10。带「owner」的是用户在 spike 后的裁决，其余按建议冻结。

## D1 导出路线：同库名的主线程 IDB 第二连接（spike 通过）

**Decision**: 失败处理经页内测试 API 在同一页面起第二个 RxDB 实例：同库名、`vfs: 'idb'`、不设 worker、`multiInstance: false`，
`connect()` 后调 `getAdapter('sqlite-wasm').backup(sink)`，再 `destroy()`。不改 demo 自己的 adapter 实例（SharedWorker 传输
被 `unsupported_combination` 拒）。

**Spike 数据（2026-10-02，临时 spec，已删除）**：

| 项                 | 结果                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| 第二连接看到的数据 | 各表行数与主实例一致；`workingTree.status()` 与主实例逐字段相等                                                                       |
| 归档               | ≈150 KB（3 条 Todo + working-tree 基线）                                                                                              |
| 耗时               | `connect()` ≈1.0 s，连接 + 备份合计 ≈1.25 s                                                                                           |
| 主实例之后         | 仍可写；第二实例销毁后再写一条 Todo 正常                                                                                              |
| 导入（spike 2）    | 归档在新上下文恢复到原库名，设 e2e 库名后 reload，应用经 IDB + SharedWorker 打开；行数、`entryCount`、`headRevision` 一致；之后仍可写 |

**`connect()` 不是空操作，但不改逻辑内容**：`RxDBAdapterSqliteBase` 每个事务在 `log_begin` / `log_commit` 里调
`switch_transaction_id`（`RxDBAdapterSqliteBase.ts:1650`），重写全部触发器，每个事务 `PRAGMA schema_version` +252、
`data_version` +1。第二连接的 `connect()` 跑一个这样的事务；主实例自己每次写入也一样（无第二连接时 807 → 1059）。
结构文本（`sqlite_schema.sql` 拼接）与各表行数前后相同。

**AC#4 口径（owner，2026-10-02）**：「导出前不改动库」改为**逻辑不变式**——导出前后结构文本、各表行数、`status()` 相等；
不补提交、不丢弃。`schema_version` / `data_version` 不在不变式里。

**并发写入（owner，2026-10-02）**：5 轮里 1 轮，备份窗口内主实例的 INSERT 报 `database is locked`（主实例没有 busy 等待）。
接受并写明：故事技术笔记与 fixture 的 TSDoc 各写一句。失败处理发生在用例体结束后，这时主页面通常已空闲，窗口 ≈1 s。

**Alternatives**: 依赖 🚧 Worker / SharedWorker 传输的备份恢复（spike 通过，不需要）；先关主页面让 SharedWorker 退出再导出
（多一次页面生命周期，且 OPFS 档仍无解，不选）。

## D2 第二实例与 dev 应用同配置：抽出共享配置

**Decision**: 从 `setup_rxdb_sqlite-wasm.ts` 抽出 `demo-rxdb-config.ts`：

- `DEMO_ENTITIES`（`[...ENTITIES, ...shop_entities, EncryptedUser]`）；
- `useDemoPlugins(rxdb, adapterOptions)`：graph / history / storage / tree / workspace / working-tree 插件、`sqlite-wasm`
  adapter 工厂（`withSqliteWasmGraphRepositories(options)`）、search 插件与 `SEARCH_PLUGIN_CONFIG`；
- `mainThreadIdbOptions(baseHref)`：`{ vfs: 'idb', wasmUrl: <wa-sqlite-async.wasm> }`；
- `createMainThreadIdbRxDB(dbName, baseHref)`：`cloneEntityClasses(DEMO_ENTITIES)` + `multiInstance: false` +
  `useDemoPlugins` + `init()`。归档导出与导入入口共用它。

主实例与第二实例只在 adapter 选项（OPFS + Worker / IDB + SharedWorker vs 主线程 IDB）和实体类（原类 vs 克隆）上不同。

**Rationale**: 结构指纹取自 `rxdb.config.entities`，`connect()` 先过 `#assertClaimedCapabilities`，缺插件就拒开、少迁移就补写；
两份手抄的插件列表迟早漂移。实体类是模块级单例，第二个实例注册同一组类会撞上主实例写在类上的槽位，所以克隆；
`cloneEntityClasses`（`@aiao/rxdb/testing`）的 TSDoc 说的就是「同一组实体类同时注册到多个 RxDB 实例」。

**Alternatives**: 第二实例直接复用原类（撞槽位，spike 前已知）；把共享配置放进 `@aiao/rxdb-test`（故事技术笔记：只有 Angular
一端用，不给公开包加 adapter 依赖）。

## D3 导入的库名：归档原库名，取自 manifest

**Decision**: 导入恢复到**归档的原库名**。manifest 没有 `dbName` 字段，取 `encryption.authDomain` 最后一个 `@` 之前的部分
（`authDomain` 即源实例的 `config.dbName`，`<库名>@<RXDB_DB_NAME_SUFFIX>`）。`encryption === null` 或没有 `@` 时报错，不猜
（无 fallback）。`RXDB_DB_NAME_SUFFIX` 不在公开面上，后缀由 `restore()` 的 `auth_domain_mismatch` 校验把关。

**Rationale**: demo 实体含 `EncryptedUser`，归档带 `authDomain = <库名>@0_1`；恢复到别的库名报 `auth_domain_mismatch`
（restore 的兼容性校验）。原库名对 dev 应用来说就是「新库名」：e2e 库名带随机后缀，不会与 `aiao` 或别的库撞。
故事技术笔记「恢复到一个新库名」按此澄清。

**Consequence**: 同一份归档在同一浏览器里第二次导入报 `target_not_empty`。导入页把它作为错误态展示（code + 提示：已导入过，
可直接打开），并给「打开该库」按钮，不覆盖、不删除。

## D4 归档流回 Node：一次 `page.evaluate` 返回 base64，页内上限 32 MiB

**Decision**: 页内 sink 收集全部 chunk，拼成一个 `Uint8Array`，base64 后由 `page.evaluate` 一次返回；Node 端解码后
`testInfo.attach('rxdb-failure-archive', { body, contentType: 'application/octet-stream' })`。页内 sink 设上限
`maxBytes`（默认 32 MiB）：超过时 sink 的 `write` 拒绝，`backup()` 报 `RxDBBackupError('io_error')`，摘要记该原因。

**Rationale**: spike 归档 ≈150 KB；e2e 用例的库都是小库。分块或 `exposeBinding` 多一套协议换不来什么。上限保护的是
CDP 消息与报告体积，不是正确性；32 MiB 的 base64 ≈43 MB，在单条 CDP 消息可承受的范围内。

**Alternatives**: `exposeBinding` 流式回传（页面崩溃时半截数据无用，协议更复杂）；`page.evaluate` 分块拉取（同上）。

## D5 超时：页内截止 20 s，Node 护栏 25 s，用例超时临时加 60 s

**Decision**:

| 层         | 值                          | 机制                                                                                                            |
| ---------- | --------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 页内截止   | 20 000 ms                   | `AbortSignal.timeout(deadlineMs)` 传给 `backup({ signal })`；`connect()` 不收 signal，与同一截止 `Promise.race` |
| 备份锁等待 | 10 000 ms                   | `backup({ lockTimeoutMs })`，超时 `lock_timeout`                                                                |
| Node 护栏  | 25 000 ms                   | `page.evaluate` 与计时器 race，护栏先到记 `{ stage: 'transfer', code: 'timeout' }`                              |
| 用例超时   | `testInfo.timeout + 60 000` | 导出前 `testInfo.setTimeout(...)`，失败处理自己的时间预算                                                       |

截止落在 `connect()` 上时，实例在 `connect()` settle 后再 `destroy()`（不阻塞返回）；落在 `backup()` 上时 `aborted`
映射为 `{ stage: 'backup', code: 'timeout' }`。

**Rationale**: spike 合计 ≈1.25 s，20 s 是 16 倍余量；锁等待取默认 30 s 的三分之一，确保它先于页内截止。
用例超时状态为 `timedOut` 时，fixture 拆卸是否还有时间预算要实测（tasks T019）。实现取 60 s：最坏路径是等页内 API 10 s +
Node 护栏 25 s，再加重开页面（D7）的启动，30 s 盖不住。

**Alternatives**: 不设页内截止只靠 Node 护栏（页面里的第二实例会一直挂着，占锁）。

## D6 触发条件：`failed` / `timedOut`

**Decision**: `testInfo.status !== testInfo.expectedStatus` **且** `testInfo.status` 是 `failed` 或 `timedOut` 时归档。
`test.fail()` 标注的预期失败不归档；`skipped` / `interrupted` 不归档。

**Rationale**: 「失败」按报告口径（意外的结果）判。`interrupted` 是整个 run 被打断（Ctrl+C / `maxFailures`），没有测试失败可调查。

## D7 主页面已关闭 / 已崩溃：同一上下文新开页面

**Decision**: fixture 在 setup 里订阅 `page.on('crash')`。拆卸时 `page.isClosed()` 或已崩溃 → `context.newPage()`，
先 `addInitScript` 写入 `rxdb-e2e-skip-working-tree-auto-enable`，再 `goto('/home')` 等页内 API 出现，在新页导出同一库名
（库名在 `localStorage`，同上下文共享）。`newPage()` / `goto` 失败（上下文已关闭等）→ 不导出，摘要记
`{ stage: 'page', code: 'context_unavailable' }`。摘要的 `page` 字段区分 `original` / `reopened`。

**Rationale**: 新页启动应用时 RxDB 跟着连接；空库会被 `enableIfEmpty()` 自动启用工作树，等于在导出前改了库，所以先写
跳过键。上下文即将随用例丢弃，写它的 `localStorage` 没有副作用。

## D8 导入入口：`/failure-archive` 页 + 库名覆盖键

**Decision**:

1. 新路由 `/failure-archive`（不挂 `connectLocalAdapter` 守卫：导入不需要连上当前库）；文件输入选择归档。
2. 先用 `RxDBBackupArchiveReader(file.stream().getReader()).readManifest()` 读 manifest，按 D3 得出库名并展示。
3. 「导入并打开」：`createMainThreadIdbRxDB(dbName, baseHref)` → `getAdapter('sqlite-wasm').restore(file.stream())`
   （`connect()` 之前）→ `destroy()`；`restore()` 之前先 `cleanupIncompleteRestore()`（无标记时空操作），残留不再挡路。
4. 成功后写 `localStorage['rxdb-demo-imported-db-name'] = dbName` 并 reload。
5. `setup_rxdb_sqlite-wasm.ts` 先读这个键：有值就用它作库名，并强制 IDB + SharedWorker 分支（与 8200 的强制 IDB 同一条路）。
6. 打开导入库时页面顶部有提示条与「回到默认库」按钮（删键并 reload）。

**Rationale**: 恢复要求空目标且在 `connect()` 前调用，所以导入不能用正在运行的主实例；OPFS 档的库在 Worker 里，导入的库只存在于
IDB，所以打开时必须走 IDB 分支。覆盖键与 e2e 库名键分开：e2e 键由 `resetE2eState` 管，混用会让隔离语义（AC#9）变模糊。

**Alternatives**: 导入后让用户手动改 e2e 库名键（只有 e2e 端口认它）；导入到 `aiao` 本身（会覆盖开发者的库，且目标非空）。

## D9 测试分层

**Decision**:

- **单测（`dev-rxdb-angular` vitest）**：纯函数——失败原因映射（`RxDBBackupError` code / 超时 / 其他异常 → `reason`）、
  sink 上限、base64 编解码、manifest → 库名、业务表行数筛选。先红后绿。
- **e2e `failure-archive.spec.ts`**：直接调用 fixture 模块导出的 `archiveFailure(page, testInfo, options)`，断言 AC#4（逻辑不变式，
  经页内 `snapshot()` 前后比较）、附件与摘要内容、AC#5（关页 / 崩溃 / 上下文关闭）、AC#8（Node 护栏超时、页内截止落在
  `connect()`、`maxBytes: 1` 触发 `io_error`）、AC#9（摘要库名 = 页面的 e2e 库名，manifest `authDomain` 对得上）。
- **e2e `failure-archive-import.spec.ts`**：AC#7——在 working-tree 页产生两次提交 + 一条未提交改动，归档；新上下文打开
  `/failure-archive` 导入，断言行数与工作树状态与摘要一致；丢弃未提交改动，恢复较早的提交，看到「恢复中」与「有未提交改动」。
- **AC#6**：lint 规则先红后绿（先加规则：27 个 spec 报错；改 import 后 0）；全量 Angular e2e 的 JSON 报告里通过的用例没有
  `rxdb-failure-archive` 附件。
- **自动触发（AC#4 的「fixture 的失败处理执行完」+ AC#1～3 不回退）**：临时探针（一条必失败用例），像阶段 A 一样不进交付 PR：
  报告里有归档、摘要与 `trace.zip`，原始断言错误仍是该用例的失败原因。

## D10 lint 守卫

**Decision**: `apps/dev-rxdb-angular-e2e/eslint.config.mjs` 加 `no-restricted-imports`：`paths: [{ name: '@playwright/test',
importNames: ['test'], message: '从 ./fixtures 取 test（US-909 失败现场归档）' }]`，`ignores` 掉 `src/fixtures.ts`。

**Rationale**: 只禁 `test` 这个具名导入；`expect`、类型照常从 `@playwright/test` 取（`e2e-utils.ts`、`search-test-api.ts` 不受影响）。
