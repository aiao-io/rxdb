# next-0831 分支深度评审

- **分支**：`next-0831`（相对 `main`，merge-base 即 `main` HEAD `8280d21`）
- **范围**：432 个文件，约 29,531 行新增 / 4,815 行删除，74 个提交
- **结论**：24 条确认为真（1 critical / 4 high / 9 medium / 10 low），3 条经复核推翻
- **修复状态**（按源码复核，判据是缺陷不再可复现，不是「提过 PR」）：

  | 编号        | 状态    | 证据                                                                                                                                                                                                                                                             |
  | ----------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | #1 critical | ✅ 已修 | `pg-runtime.ts` 改用 `tableRefOf()` 的 schema 限定名，`sqlTableName` 只留作迁移账本键                                                                                                                                                                            |
  | #2–#4 high  | ✅ 已修 | `electron-pglite-host.ts` 的 `end()` 检查 `commitError`；`panel-endpoint.ts` `#onError` 查 `#transferOf()`；`endpoint.ts` `#createSink` 包 try/catch 回 ERROR                                                                                                    |
  | #5 high     | ✅ 部分 | 四个 adapter 的 `lib.entry` 已补 `testing`；`files` 排除 `__tests__` 与 `import.meta.glob` 冲突**未修**，`@aiao/source` 条件对消费者仍失效                                                                                                                       |
  | #6–#9       | ✅ 已修 | `#onMessage` 包 `reportOutOfBand`；`discard()` 改用 `cleaned` 位；健康检查按 `table_schema` 过滤；集成测试驱动真实 `RxDBAdapterPGlite`                                                                                                                           |
  | #10–#14     | ✅ 已修 | `withExclusive(fn, signal?)` 穿到 `PathLockManager`；`closeAll` 以 `DESKTOP_PGLITE_CLOSE_ALL_TIMEOUT_MS` race 后无条件 `terminate()`；`assertWhereDepth` 32 层上限回 400；`notifyNavigation()` 推进 `connectionEpoch`；`OpfsService.load()` 代际计数丢弃迟到响应 |
  | 低危        | 未复核  | 按需排期                                                                                                                                                                                                                                                         |

## 评审方法

把全部改动按 10 个子系统拆开，每个子系统派一个深度评审 agent，产出的每条发现再派一个对抗式复核 agent 读源码逐条确认/证伪：

| 子系统                           | 内容                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------- |
| `pglite-adapter-stack`           | `rxdb-adapter-electron` / `-pglite` / `-sqlite-core` 的桌面 PGlite host、线协议、事务、通知批处理 |
| `rxdb-devtools-pkg`              | `rxdb-devtools` v2 panel-endpoint / endpoint / native+opfs 文件 provider / connector 重构         |
| `plugin-search`                  | `rxdb-plugin-search` 的 pg (PGlite) FTS 后端 + backend-registry + 核心 adapter-guard              |
| `plugin-storage`                 | `rxdb-plugin-storage` 的 devtools-desktop-filesystem / snapshot / storage.service                 |
| `electron-app`                   | `dev-rxdb-electron` 的 pglite bridge/worker/request-guard、preload、tx 实验工具                   |
| `tauri-app-and-adapter`          | `dev-rxdb-tauri` + `rxdb-adapter-tauri` 的 Rust lib.rs/selfcheck.rs、webview/storage probe        |
| `http-server-and-recipes-domain` | `dev-rxdb-http-server` 重构（删除 rule-group-to-sql）+ 新 `recipes-domain` 模块                   |
| `devtools-extension`             | `rxdb-devtools-extension` 的 background/bridge/port、删除 OPFS 打包路径                           |
| `devtools-panel`                 | `rxdb-devtools-panel` 新 Angular 面板、transport、wire relay、opfs.service                        |
| `build-config-scripts-ci`        | release gate 脚本、tsconfig、pnpm-workspace、CI、新 e2e app、各 adapter 的 `./testing` 导出       |

复核规则：复核 agent 必须读实际源码，`isReal` 只在缺陷可复现时成立；严重度以复核结果为准。

## 总体结论

这批代码的主体工程面（PGlite 桌面 host 的事务 ID 协议、devtools v2 数据面、pg FTS 后端）设计思路清晰、注释交代了取舍，但**三条最严重的缺陷都出在"两个适配器 / 两套命名约定"的交界处，或"异步错误信号被丢弃"的收口上**——这正是这种多后端、多进程、多数据面的架构最容易漏的地方。

- 1 条 critical：pg 搜索后端整条链路吃了 SQLite 的 `$` 连接表名，而 PGlite 实际表是 schema 限定的，**搜索对 pglite 完全不可用**，且被一个"手工造假表"的集成测试掩盖。
- 4 条 high 里 3 条是**静默失败**（COMMIT 失败被吞成成功、上传失败被丢、TRANSFER_START 未保护抛出），1 条是四个 SQLite adapter 的 `./testing` 导出指向从未构建的文件。
- 建议优先修 critical + 前 3 条 high（都会进发布产物，且是数据完整性/功能完全失效级别），再处理 medium。

---

## Critical（1 条）

### 1. pg 搜索后端用了 SQLite 的 `$` 连接表名，PGlite 表是 schema 限定的 → 搜索对 pglite 完全不可用

- **文件**：`packages/rxdb-plugin-search/src/core/fts5-installer.ts:62`
- **类别**：正确性
- **现象**：`extractFtsPlanFromMetadata` 用 `@aiao/rxdb-adapter-sqlite-core` 的 `get_table_name` 生成 `public$article`（SQLite 的 `${namespace}$${name}` 约定），而 `RxDBAdapterPGlite.createTables()` 实际建的是 `"public"."article"`（schema 限定）。pg 后端把这个扁平名原样塞进 `ALTER TABLE "public$article" ...`，Postgres 直接抛 `relation "public$article" does not exist`，`plugin.ready` reject，搜索链路整体不可用。
- **复现**：用 pglite adapter 建库、给实体加 `searchable: true` 字段 → `resolveSearchBackend('pglite')` 命中 pg-tsvector → `applyStructure` 对不存在的 `"public$article"` 发 `ALTER TABLE` → 抛错。
- **根因**：`physicalTableOf(plan) = plan.sqlTableName ?? plan.tableName`（`pg-runtime.ts:50`）把 `extractFtsPlanFromMetadata` 给的扁平名当成了物理表名，中间没有任何 adapter 级纠偏。
- **修法**：让 pg 后端用 adapter 的 schema 限定名——要么 `extractFtsPlanFromMetadata` 改成通过 adapter 的命名函数取物理表名，要么 pg-runtime 把 `${namespace}$${name}` 翻译成 `"namespace"."name"`。同时把集成测试改成驱动真实 `RxDBAdapterPGlite`（见 medium #4）。

---

## High（4 条）

### 2. COMMIT 失败被上报为成功 → 静默数据丢失

- **文件**：`packages/rxdb-adapter-electron/src/pglite-host/electron-pglite-host.ts:456`
- **类别**：正确性
- **现象**：`settle()` 里 `await entry.finished.catch(() => undefined)` 把 `transaction(...)` 的 rejection 吞掉，`end()` 无条件返回 `{kind:'pg.commit'}`。PGlite 的 `transaction()` 在 COMMIT 阶段失败（如 `DEFERRABLE INITIALLY DEFERRED` 约束在提交时检查、提交期磁盘错误）会 `ROLLBACK` 并 rethrow，这个失败信号被丢弃后渲染端判定写入成功、RxDB 更新缓存/change-log，但 Postgres 实际已回滚。
- **根因**：作者注释"必须等 transaction 自己落地"表明本意要等提交完成，却用 `.catch(() => undefined)` 丢掉了失败信号；`end()` 不看 `finished` 的结果就回成功帧。
- **修法**：`end()` 前检查 `entry.finished` 是 resolve 还是 reject，reject 时回 `{kind:'pg.error', ...}`；不要在 `settle()` 里吞异常。

### 3. 上传传输失败被静默丢弃，`upload()` 报"已发送"且可能无限挂起

- **文件**：`packages/rxdb-devtools/src/v2/panel-endpoint.ts:560`
- **类别**：正确性
- **现象**：connector 在 `files.upload` 注册完成（任何字节写入前）就回 RESPONSE，panel 随即从 `#requests` 删掉该 requestId。之后 chunk 写失败（磁盘满/权限）时 connector 发的 ERROR 找不到归属（`#onError` 只看 `#requests` 和下载专用的 `#downloads`），被丢进 `rejectedFrames`。上传的 `abort` promise 只绑到已 resolve 的 REQUEST 结果，永不触发，`#drive` 继续发 chunk 并返回 `{outcome:'sent'}`。源卡住也因无 panel 侧超时而永久挂起。
- **根因**：下载有专门的 RESPONSE 后错误分支（经 `#downloads`），上传没有等价物；`#transfers` 表没有参与错误路由。
- **修法**：给上传补一个与下载对称的 post-RESPONSE 错误分支（`#onError` 同时查 `#transfers`，并 `#abort` 对应 transfer）；加 panel 侧上传超时。

### 4. `createChunkSink` 在 TRANSFER_START 上同步无保护调用，OPFS 上传注册是异步的 → 未处理异常 + 静默丢数据

- **文件**：`packages/rxdb-devtools/src/v2/endpoint.ts:616`
- **类别**：正确性
- **现象**：panel 注释明确"不必先等一轮 RESPONSE"，REQUEST 后立即发 TRANSFER_START。但 OPFS provider 的 `uploads.set(transferId,…)` 要等 `await resolveDirectory(...)` 之后才执行（`opfs-files-provider.ts:173-175`），TRANSFER_START 到达时 `createChunkSink` 对未注册的 transferId 抛错。这个 throw 无 try/catch，逃出消息处理器，transfer 表项和会话槽位泄漏，后续 chunk 被 `?.sink.write` 静默丢弃——panel 报成功但没写入任何数据。
- **根因**：`#openTransfer` 同步无保护调用 `createChunkSink`，且 endpoint 从不校验 transferId 是否已由 `files.upload` REQUEST 注册。测试里 `fake-providers.createChunkSink` 不校验注册、native provider 同步注册，掩盖了这个只在浏览器 OPFS 路径暴露的 race。
- **修法**：`#openTransfer` 包 try/catch；对未注册的 transferId 回 ERROR 帧而非抛异常（或让 provider 同步登记 transferId）。

### 5. 四个 SQLite adapter 的 `./testing` 导出指向从未构建的 `dist/testing.js`

- **文件**：`packages/rxdb-adapter-wa-sqlite/vite.config.mts:59`（及 `rxdb-adapter-sqlite` / `-sqlite-wasm` / `-sqliteai`）
- **类别**：正确性（打包）
- **现象**：四个 adapter 都在 package.json 加了 `./testing` 子路径导出（`import` 指向 `./dist/testing.js`），却都没把 `testing` 加进 Vite `lib.entry`，导致 `dist/` 里只有 `testing.d.ts` 没有 `testing.js`。消费者走 node_modules 会 `ERR_MODULE_NOT_FOUND`。次要：`src/testing.ts` 用 `import.meta.glob('./__tests__/…factory.ts')`，但 `files` 排除了 `!src/**/__tests__/**`，源路径（`@aiao/source` 条件）对消费者同样失效。
- **修法**：给四个 adapter 的 `lib.entry` 都补 `testing`（对照 `rxdb-adapter-sqlite-core` 和 `rxdb-adapter-encrypted` 已正确配置）；并解决 `files` 排除项与 `import.meta.glob` 目标冲突。

---

## Medium（9 条）

### 6. `#onMessage` 未包 try/catch，畸形 NOTIFY 打断同通道其他监听

- **文件**：`packages/rxdb-adapter-electron/src/pglite/desktop-pglite-client.ts:496`
- **类别**：健壮性
- **现象**：`parseDesktopPgliteNotifyMessage` 和 `#batcher.accept` 均无 try/catch；合法 JSON 但 `ids` 不可迭代的 payload（如 `NOTIFY rxdb_change_notify, '{"operation":"INSERT"}'`）会让 `for (const id of data.ids)` 抛 TypeError，异常逃进 preload 桥的 `ipcRenderer.on` 扇出，共享通道上的其他实例收不到自己的通知。SQLite 版本 `DesktopSqliteClient.#onMessage` 特意用 `reportOutOfBand` 包了同样的逻辑。
- **修法**：对齐 SQLite 版本，包 try/catch + `reportOutOfBand`。

### 7. `discard()` 提前 return，commit 在拷贝阶段失败会泄漏临时文件

- **文件**：`packages/rxdb-devtools/src/browser/opfs-files-provider.ts:276`
- **类别**：资源泄漏
- **现象**：`commit()` 先 `settled=true`、关 temp 流、`writable=undefined`，再拷贝 temp→target。拷贝阶段任一步失败（如 `QuotaExceededError`）时调用方走 `sink.discard()`，但 `discard()` 开头 `if (settled && writable === undefined) return;` 恰好命中这个状态，跳过 `cleanup()`，`.rxdb-devtools-upload-*` 临时文件被孤儿化，目标可能半写——违反模块头部"失败/取消/超时不留残留文件"的承诺。
- **根因**：守卫想表达"已完成 commit 幂等"，却无法区分"cleanup 已跑"与"commit 死在拷贝阶段"。
- **修法**：用一个独立布尔位记录 `cleanup` 是否已执行，只有真执行过才早退。

### 8. 运行时健康检查漏 `table_schema`，真实 PGlite 表永远判"缺失"

- **文件**：`packages/rxdb-plugin-search/src/backend/pg/pg-runtime.ts:104`
- **类别**：正确性
- **现象**：`inspectPgRuntimeObjects` 只按未限定的 `table_name`/`tablename` 过滤 `information_schema.columns` 和 `pg_indexes`，且传入的是扁平名 `public$article`；真实 PGlite 表的 `table_name` 只是 `article`（schema 为 `public`）。`has_column`/`has_index` 恒为 0，`hasHealthyPgRuntimeObjects` 恒 false，每次重连都走重建分支（DROP/CREATE 触发器 + 全表 `_fts` 重算），而非 `already_installed` 空操作。
- **修法**：健康检查按 schema 限定的物理表名匹配（补 `table_schema` 过滤，或传 adapter 的限定名）。

### 9. pg 后端从未通过真实 `RxDBAdapterPGlite` 驱动，测试掩盖命名错配

- **文件**：`packages/rxdb-plugin-search/src/__tests__/backend/pg-backend-integration.spec.ts:55`
- **类别**：测试空洞
- **现象**：`search-behavior.suite.ts` 只接了 sqlite/sqliteai/wa-sqlite，没有 pglite 浏览器 spec；`pg-backend-integration.spec.ts` 手工 `CREATE TABLE "public$article"` 并硬编码 `sqlTableName:'public$article'`，内部自洽但从没经过 `RxDBAdapterPGlite` 的 `"public"."article"` 建表，导致 critical #1 的命名错配在 CI 里永远绿。
- **修法**：把 pg 后端接进真实 pglite adapter（或给 `@aiao/rxdb-adapter-pglite/testing.ts` 提供 sqlite-core 兼容的 AdapterFactory），跑 `extractFtsPlanFromMetadata` 而非手工构造 plan。

### 10. snapshot `lock.run` 等锁期间不响应 abort signal

- **文件**：`packages/rxdb-plugin-storage/src/devtools-desktop-snapshot.ts:94`
- **类别**：正确性 / 契约
- **现象**：`lock.run` 只在进入时（92 行）和回调内（95 行）检查 signal，真正的锁获取 `storage.runExclusive → withExclusiveLock → PathLockManager.withExclusive` 无 signal/timeout，阻塞在 `Promise.allSettled([previousGate, ...inFlight])` 直到慢写入排空。这违反 `DevToolsSnapshotLock.run` 的 TSDoc（"等锁必须响应 signal"）；store 的 `Promise.race` 掩盖了面板症状，但底层 waiter 持锁、`dispose()/cancel()` 无法中断，慢写入下反复请求快照会累积排队 waiter。
- **修法**：把 signal 穿进 `runExclusive`/`withExclusive`，或在锁获取上 `race` signal。

### 11. `closeAll()` 等 worker ACK 后才 terminate 且无超时，worker 卡住时退出挂起

- **文件**：`apps/dev-rxdb-electron/src-electron/desktop-pglite-bridge.ts:328`
- **类别**：资源泄漏
- **现象**：`closeAll()` 里 `await dispatch(active, {op:'closeAll'})` 必须 settle 后 `finally` 才 `await active.terminate()`。worker 阻塞在同步 WASM 查询（如 `SELECT pg_sleep(30)`）时无法处理 closeAll 消息，`dispatch` 永不 resolve，`terminate()` 不可达——正是注释声称要防的"进程等一条永不结束的 worker"。
- **修法**：`dispatch` 与超时 `race`，`finally` 里无条件 `terminate()`（ACK 不来也强杀）。

### 12. 删除的 `MAX_DEPTH` 守卫未替换，深层嵌套 where 栈溢出返回 500

- **文件**：`apps/dev-rxdb-http-server/src/recipes-repository.ts:48`
- **类别**：正确性
- **现象**：被删的 `rule-group-to-sql.ts` 有 `MAX_DEPTH=32` 守卫（超限抛 `FilterCompileError`→400）。新代码 `normalizeWhere` 只把客户端 `where` 强转 `RuleGroup`，`buildRuleGroupPG` 无深度限制递归，约 5000 层嵌套（约 150KB，远小于 1MiB 体上限）栈溢出，`mapEngineError` 把它归到 500 而非原来的 400。
- **修法**：在 `normalizeWhere`（或编译器）恢复深度上限，超限回 400。

### 13. `notifyNavigation()` 不重置 v2 endpoint，页面导航后文件 tab 静默变旧

- **文件**：`apps/rxdb-devtools-extension/src/devtools/services/port.service.ts:109`
- **类别**：正确性
- **现象**：`notifyNavigation()` 只经 `notifyListeners` 发 v1 DISCONNECT，不 bump `connectionEpoch` 也不通知 frame lane。v2 endpoint 只订阅 `connectionEpoch`/`subscribeFrames`，看不到这次 DISCONNECT，跨导航后仍停在 `'v2'` 态，拒绝新 connector 的重新握手（`#onLegacyHandshake`/`#onV2Handshake` 都在 `state==='v2'` 时 `#reject`）。文件/OPFS 域走 `endpoint.request('files',…)`，于是文件 tab 静默显示旧数据，而 DB/events（v1）通过 DISCONNECT+HANDSHAKE 恢复了，掩盖了不一致。
- **修法**：`notifyNavigation` 同时 bump `connectionEpoch` / 通知 frame lane，让 v2 endpoint 重新协商。

### 14. `OpfsService.refresh()` 无 in-flight 守卫，乱序返回覆盖新目录内容

- **文件**：`modules/rxdb-devtools-panel/src/services/opfs.service.ts:98`
- **类别**：正确性
- **现象**：快速点 `/a`→`/b`，两次 `refresh()` 各自同步捕获 `currentPath()` 但 await 后无条件应用 `files`/`loading`。若 `list('/a')` 晚于 `list('/b')` 返回（传输层并发 32、允许乱序），`files()` 最终持 `/a` 的内容而 `currentPath()` 是 `/b`，用户可能在已离开的路径上误删/误下载。
- **修法**：await 后校验捕获的 path 仍等于 `currentPath()`，或用请求代际计数器丢弃过期响应。

---

## Low（10 条）

### plugin-storage 健壮性

- **`devtools-desktop-filesystem.ts:209`** — `dispose()` 对 open-session promise 只传 onFulfilled，`file.open` 失败时产生未处理 rejection；兄弟实现 `desktop.ts:388` 正确传了 `() => undefined`。
- **`devtools-desktop-snapshot.ts:70`** — （效率）`collectFiles` 遍历目录时不同步观察 signal，`list()` 对每项发 N+1 次 stat 且不可中止；大目录下取消不响应，`signal.throwIfAborted()` 只在递归顶部调用。

### electron 实验工具

- **`tools/pglite-tx-experiment/variant-a-host.mjs:114`** — 原型 `begin()` 超时只 `open.delete(txId)` 不 reject `settle`，连接空闲后回调永远挂在 `await closed`、锁死共享连接；生产版 host（`electron-pglite-host.ts:401`）已修此 bug，原型未同步，其超时/崩溃测量不反映生产修复。

### http-server 语义

- **`recipes-repository.ts:62`** — `mapEngineError` 把所有 `RxdbAdapterPGliteError` 都映射为 400，但该类也用于内部错误（`Unsupported repository type`、`DURABILITY_LOST`、`transformValueJsToPGlite` 等），服务器 bug 被伪装成客户端错误。
- **`rxdb-store.ts:92`** — `seedRxdbStore` 用 `saveMany`（UPSERT）且无前置 DELETE，`seed` 命令不再清空旧行；被删的 `seedDatabase` 原本在事务里 `DELETE FROM recipes`，现在会保留用户多出的行。
- **`change-broadcaster.ts:58`** — 单槽 `pendingClientId` 假设写入串行，但并发 HTTP 请求可在 16ms NOTIFY 批窗口内交错 `recordWrite`，早到写者的 clientId 被覆盖，回声抑制（D6）失效。

### tauri

- **`tauri-host-access.service.ts:34`** — `evaluate()` 声明 `Promise<T>` 却同步 `throw`，调用方的 `.catch`/`.finally` 被绕过（清理 loading 的 spinner 卡住）；改为 `async` 或 `return Promise.reject(...)` 即可。

### devtools-panel

- **`opfs.service.ts:168`** — `upload()` 完成后用 `refresh()`（读实时 `currentPath`）而非捕获的 target 做确认，上传期间导航会误报"上传未确认"或误判同名文件。

### 测试空洞

- **`modules/recipes-domain/src/recipe-query.ts:29`** — 前后端共用的"单一来源" wire 序列化/查询 helper（含 `toIso` 的 fallback 分支）无单测，只有 schema metadata 被覆盖；违反 TDD 铁律。
- **`port.service.ts:79`** — 新增的 v2 传输面（`subscribeFrames`/`postFrame`/`connectionEpoch`）无 spec，兄弟 Tauri adapter 的 `tauri-transport.service.spec.ts` 已有对应测试可作范式。

---

## 已复核推翻（3 条）

- **electron 端 provider 装配"无测试"** — 库层已被 `connector-providers.spec.ts`（95-141）、`native-snapshot-source.spec.ts` 等覆盖；剩余未测的是 app 入口的一行惰性闭包，已明确留给 stage-D e2e（`devtools-stage-d-probe.mjs` 里 AC#46-53 均标 `TODO(stage-d)`）。
- **空 PATCH 不 bump `updatedAt`** — `change-broadcaster` 有意按"库里的行是否真变"门控广播，no-op PATCH 当 no-op 处理是设计而非缺陷（被删的 `recipes-store.ts` 反而会对无变化的写虚假刷新）。
- **Tauri `project.json` 构建顺序删除 devtools 产物** — 验证确认"devtools 窗口被编译"（`#[cfg(dev)]`）与"`frontendDist` 解析"（`cfg(not(dev))`）两个前置条件互斥：`tauri build`/`--debug` 跑 `nx build` 但没有窗口，`tauri dev` 有窗口但跑 `nx serve`，故"blank/404"不可复现。

> **旁支待跟进**：复核第 3 条时发现一个真实的相邻 bug——`tauri dev` 下 devtools 窗口是坏的，因为 `nx serve` 从不跑 `build-devtools`、dev server 也不提供 `devtools/devtools.html`。根因与"构建删除产物"不同，且本身未经二次验证，建议单独排查确认。

---

## 建议的修复顺序

1. **critical #1（pg 表名错配）** —— 先让 pg 后端用 adapter 的 schema 限定名，再把集成测试接到真实 `RxDBAdapterPGlite`（medium #9），否则整个 pglite 搜索功能不可用。
2. **high #2（COMMIT 失败吞成功）** —— 数据完整性级，最小改动是 `end()` 前查 `finished` 结果并回 error 帧。
3. **high #3 / #4（上传失败丢弃 / TRANSFER_START 未保护）** —— devtools v2 上传通道的静默失败，给上传补对称错误分支、给 `#openTransfer` 加守卫。
4. **high #5（`./testing` 导出缺失）** —— 四个 adapter 补 `lib.entry`，打包级、改动机械。
5. **medium #10 / #11（signal 契约、closeAll 挂起）** —— plugin-storage 与 electron 的资源收口，涉及跨包接口与 worker 生命周期。
6. **medium #12 / #13 / #14（http-server 深度守卫、v2 导航重置、opfs 乱序）** —— 按需排期，前两条是行为回归，第三条是 demo UX 竞态。
7. 低危项按需要排期；测试空洞（`recipe-query.ts`、`port.service.ts`）与文档类可直接补。
