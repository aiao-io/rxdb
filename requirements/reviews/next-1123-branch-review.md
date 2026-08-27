# next-1123 分支深度评审

- **分支**：`next-1123`（相对 `main` 的 merge-base `a63321c`）
- **范围**：138 个文件，约 17,540 行新增 / 320 行删除
- **结论**：24 条确认为真（0 critical / 0 high / 7 medium / 17 low），3 条经复核推翻

## 评审方法

把全部改动按 8 个子系统拆开，每个子系统派一个深度评审 agent，产出的每条发现再派一个对抗式复核 agent 读源码逐条确认/证伪：

| 子系统                     | 内容                                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------- |
| `rxdb-adapter-http`        | HTTP 适配器库（change-feed / conditional-cache / transport / chunking / pagination + wire 集成测试） |
| `dev-rxdb-http-server`     | 参考 HTTP 后端（路由 / rule-group-to-sql / recipes-store / SSE / page-token / cors）                 |
| `dev-rxdb-http`            | 浏览器 demo（app / setup / traffic-recorder / filter-rules / paging / worker）                       |
| `dev-rxdb-http-e2e`        | Playwright e2e                                                                                       |
| `rxdb` core                | 查询缓存失效（Repository / QueryManager / QueryCacheRepository / query-cache-primary / rxdb-events） |
| `rxdb-adapter-sqlite-core` | 查询缓存行契约                                                                                       |
| `rxdb-devtools` + electron | connector-events + MV3 探针                                                                          |
| 契约 / 文档                | api-baseline / tsconfig / website 文档 / requirements                                                |

复核规则：复核 agent 必须读实际源码，`isReal` 只在缺陷可复现时成立；严重度以复核结果为准（复核可上调/下调）。

## 总体结论

这批代码质量异常高：参数化 SQL、列名白名单、请求体与嵌套深度上限、SSE 生命周期收口、事件监听器按引用相等注销，这些细节都处理到了，且几乎每处关键设计都写明了取舍理由。

7 条中危集中在**可发布库的两个核心并发点**（`rxdb-adapter-http` 的变更通知重连、`rxdb` 的查询缓存失效）和 demo 服务器的两个健壮性缺口。前 3 条会进发布产物，建议优先修；demo 侧的中危可接受，但应在 README 显式声明。

---

## 中危（7 条，建议修复）

### 1. `start()` 不取消待执行的退避重连定时器

- **文件**：`packages/rxdb-adapter-http/src/change-feed.ts:154`
- **类别**：并发
- **现象**：`HttpChangeFeed.start()` 只调 `#connect()`、不调 `#clearTimer()`，而 `connect()` 的重连路径会直接调 `start()`。上一代失败时排下的退避定时器会在新连接建立后照常触发，`#connect()` 开头先 `#close()` 把刚建好的 SSE 拆掉再重建，再触发一次 D7 全量失效。
- **复现**：① 通道连上后被后端拒绝，`#fail()` 排了一个退避定时器（如 baseDelay=1000ms）；② 定时器触发前适配器重连或 `startChangeFeed()`，`start() → #connect() → #close()` 建出新的 EventSource S2，`onopen` 跑 D7 全量失效；③ 旧定时器随后触发 `#connect()`，先 `#close()` 拆掉 S2、再开 S3，`onopen` 又跑一次全量失效。结果：刚建好的 SSE 被无谓拆掉重建，所有已订阅实体被二次失效（多一轮远端拉取）。
- **根因**：`stop()` 里做了 `#clearTimer()`，`start()` 没做——「`start()` 自带先收口上一条」的幂等契约只兑现了一半。
- **修法**：`start()` 里补一句 `#clearTimer()`。

### 2. 代数守卫只护 `remember`，不护 stale sync 的本地写

- **文件**：`packages/rxdb/src/repository/query-cache-primary.ts:230`
- **类别**：并发
- **现象**：`invalidateInflight()` 只清并发去重表、不取消在飞的同步；generation 计数器只在 `QueryCacheSyncMemo.remember` 里查，而 `#reconcile` 无条件执行 `deleteByIds` / `upsertMany`，无任何 generation 或取消守卫。
- **后果**：一条旧同步迟到的 reconcile 会覆盖掉失效后重跑出的新结果。这是失效路径上的真实竞态，会产生错误数据（不只是多一轮请求）。

### 3. `finalize` 按 fingerprint 删去重表、无身份校验

- **文件**：`packages/rxdb/src/repository/QueryCacheRepository.ts:314`
- **类别**：并发
- **现象**：`finalize` 用 `delete(fingerprint)` 做 key 删除、不校验身份。失效清表后，新流用同一 fingerprint 重插，旧流的 `finalize` 会把新条目误删。
- **后果**：静默打穿并发查询去重（多一轮远端往返），数据本身不错。

### 4. DB 句柄在请求飞行中被换掉

- **文件**：`apps/dev-rxdb-http-server/src/server.ts:305`
- **类别**：并发
- **现象**：`getDb()` 在 dispatch 时求值一次、把 `DatabaseSync` 按值传进 `runProtocol` / `routeProtocol` / `handleMetadata`；`handleMetadata` 里 `await readJsonBody` 让出事件循环期间，`__control/reset` 会 `db.close()` 并重建句柄。恢复后旧句柄 `db.prepare` 抛 "database is not open" → 合法请求吃 500。
- **根因**：与 `server.ts:222-231` 注释声明的「始终通过闭包读当前句柄」意图相反——闭包在 await 之前就被调了一次。
- **修法**：传 `getDb` 闭包、每次使用前取，而不是取一次传值。

### 5. `__control` 破坏性端点无鉴权且默认开启

- **文件**：`apps/dev-rxdb-http-server/src/server.ts:293`
- **类别**：安全
- **现象**：`reset` / `clear` 走控制分支，位于 `assertAuthorized` 之前，`runControl` 从不鉴权；`controlEnabled` 在 `NODE_ENV !== 'production'` 时默认 true。
- **后果**：文档命令 `node src/main.ts serve` 不带 `NODE_ENV`，公网任何客户端都能 `POST /v1/__control/reset`（删库重建）/ `clear`（清表）。demo 可接受，但应在 README 显式警告。

### 6. ONE_TO_ONE 默认值豁免与 DDL 不一致

- **文件**：`packages/rxdb-adapter-sqlite-core/src/query-cache-row-contract.ts:71`
- **类别**：正确性
- **现象**：契约豁免了带字面量 `default` 的 ONE_TO_ONE 关系，但 `create_table_sql.ts` 只对 MANY_TO_ONE 发 `DEFAULT` 子句。`nullable:false` 的 ONE_TO_ONE 列建出来是 `NOT NULL` 且无默认值——省略该列能过契约校验，却会在 INSERT 时报错。
- **修法**：契约与建表对「可省略列」的定义必须对齐（要么契约不豁免 ONE_TO_ONE，要么 DDL 补默认值）。

### 7. `update()` 只在当前页找目标行

- **文件**：`apps/dev-rxdb-http/src/app/app.ts:489`
- **类别**：正确性
- **现象**：`recipes.value()` 只含当前页（limit/offset 下推），`startEdit` 只存 id，保存时 `find` 找不到翻页/过滤后的目标行。
- **后果**：误报「已删除」，用户明明没删。demo 的 UX 缺陷。

---

## 低危（17 条）

### 服务器安全边界（demo 可接受，但文档应说清）

- **`server.ts:90`** — 鉴权只校验 `Authorization` 头形状（`/^Bearer .+/`），从不比对 token 值（`DEMO_TOKEN` 从未被 import/比较）。
- **`cors.ts:52`** — 回显任意 `Origin`，安全前提「永不发 `Access-Control-Allow-Credentials`」只存在于注释里；一旦未来补上凭据头，就变成任意站点代读。
- **`page-token.ts:54`** — 翻页 token 未签名、客户端可伪造；因只作绑定参数、无行级鉴权，影响限于重读/跳页。

### 变更通知诊断噪音

- **`change-feed.ts:186`** — 非法 URL（如 `https://`）通过非空校验后 `new EventSource()` 同步抛错，`#fail` 把它当瞬时故障无限退避重试，与同函数 `unsupported-runtime` 分支「不排重连」的处理自相矛盾。

### 核心事件丢失

- **`RxDB.ts:725`** — `invalidateRemoteEntity` 派发的是非跨标签事件；若在事务内触发且事务回滚，`handleTransactionRollback` 只重放 `isCrossTabEvent`，这条远端失效被静默丢弃。

### 查询缓存行契约

- **`RxDBAdapterSqliteBase.ts:663`** — 契约显式允许未知额外列（AC#3），`upsertMany` 用 `Object.keys` 拼 INSERT 列名并带 `?? column` 兜底，schema 漂移的同质批次会把 `remoteOnly` 直接写进 SQL。

### demo 观测口径（app.ts）

- **`app.ts:267`** — `$metadataRequests` 按 `/metadata` 子串统计全部流量，把首载、翻页、筛选都算进去，与「变更通知重跑次数」语义不符。
- **`app.ts:233`** — `clearLogs()` 清空 traffic 会让离线横幅在仍离线时消失（`$networkDown` 取 `traffic.at(-1).status === 0`）。

### 测试空洞

- **`page-token.spec.ts:25`** — token 翻页测试唯一证据是页面显示的 `pageMode` 字符串（自己设的），其余断言与形态无关，等于没验证 token 翻页真跑了。
- **`cors.spec.ts:26`** — edit-then-fill 复现了同一套件别处已在防的 select-all/insert 竞态（PATCH body 不确定）。
- **`rxdb-contract.spec.ts:94`** — 新增回归测试两个断言是同义反复，抓不到 connector 转发回归。
- **`devtools-mv3-feasibility.spec.ts:219`** — 直接解引用可空的 `panelCapabilities`，`activation.frame` 为 null 时会 TypeError。

### 文档与实现不一致

- **`http-protocol.md:57`** — 把 `isTableExisted` 默认路径写成 `:entity`，实际 `rest.ts` 无该 handler、客户端回退到 `POST :entity/metadata`。
- **`sync.md:352`** — 说字面量默认列可省略，漏了 binary 例外（`query-cache-row-contract.ts:58` 与 `create_table_sql.ts:73` 都实现了它）。

### electron MV3 探针

- **`devtools-mv3-probe.mjs:251`** — 授权回环硬编码 `tabId=1` 而非真实 `webContents.id`（当前不误判，是潜在 bug）。
- **`devtools-mv3-probe.mjs:351`** — 回环判定把 fixture 自身 `postMessage` 的自回声当成 page→devtools 握手证据。
- **`devtools-mv3-probe.mjs:263`** — foreign 源服务绑 `localhost` 而页面走 `localhost:PORT`，IPv4/IPv6 解析可能不一致（medium 置信度）。

---

## 已复核推翻（3 条）

- **`change-subscribers.ts:44`**「对刚断的 SSE socket 写会抛 500」——实测 Node v24 上 `response.write()` 对已关闭/已销毁 socket 返回 false 而非抛错，`writableEnded` 守卫已足够。
- **`query-cache-row-contract.ts:134`**「异质检查误伤合法稀疏 null 批次」——这是显式文档化的 fail-fast 设计，不是缺陷。
- **`conditional-requests.spec.ts:95`**「AC#10 静默断言不可重试」——`consoleErrors`/`pageErrors` 是自页面加载起只增不减的数组，重试补救不适用，严格静默断言是刻意选择。

---

## 建议的修复顺序

1. **`change-feed.ts` `start()` 补 `#clearTimer()`**（中危 #1，最小改动）。
2. **`query-cache-primary.ts` / `QueryCacheRepository.ts`** 的失效竞态（中危 #2、#3，需给 reconcile 加 generation/取消守卫、给 finalize 加身份校验）。
3. **`query-cache-row-contract.ts` 与 DDL 对齐**（中危 #6）。
4. **`server.ts` DB 句柄改传闭包**（中危 #4）；README 声明 `__control` 与鉴权边界（中危 #5）。
5. 低危项按需要排期，文档类（`http-protocol.md`、`sync.md`）可直接修。
