# rxdb-plugin-querycache 深度评审

- 包：`@aiao/rxdb-plugin-querycache`
- 日期：2026-10-28
- 基线：`7bb16a9014095d4003bd059244722013b36867c1`
- 结论：🟡凑合。发现 1 条 P2：在线写回执反序到达时，已确认删除的本地缓存行会被旧更新回执复活。

## 评审计划与实际范围

从稳定生产入口 `createQueryCachePrimary` 追到增量引擎，重点检查离线写、远端响应解码、SWR、在飞去重、作废代次、出站队列保护和 memo 生命周期。

## 核查结果

- [`createQueryCachePrimary`](../../../packages/rxdb-plugin-querycache/src/query-cache-primary.ts) 对非 `public` 命名空间使用 `namespace:entity` 标识，避免正常在线请求落到同名公共实体。
- [`QueryCachePrimaryRepository.create`](../../../packages/rxdb-plugin-querycache/src/query-cache-primary.ts)、`update`、`remove` 在成功写后同时清 memo 与在飞代次；远端回包经过 `parseEntityRecordValues` 解码。
- [`QueryCacheEngine.find`](../../../packages/rxdb-plugin-querycache/src/QueryCacheEngine.ts) 的 finalize 按 Observable 身份清理去重表；`onRemoteError` 广播给共享请求的所有消费者。
- [`QueryCacheEngine.findById`](../../../packages/rxdb-plugin-querycache/src/QueryCacheEngine.ts) 在首次远端请求前捕获作废代次；拉取写入通过同一代次门禁，不能直接复报已修的旧响应覆盖问题。
- [`QueryCacheSyncMemo.remember`](../../../packages/rxdb-plugin-querycache/src/query-cache-sync-memo.ts) 拒绝旧 generation 写回，过期定时器可清理。
- [`RxDBPluginQueryCache.install`](../../../packages/rxdb-plugin-querycache/src/plugin.ts) 把引擎工厂的注册绑定作用域；没有杜撰一个不存在的 `rxdb.queryCache` 运行时属性。

- [`QueryCacheEngine.#pull`](../../../packages/rxdb-plugin-querycache/src/QueryCacheEngine.ts) 的读侧落库代次与在线写回执是不同通道；既有旧 pull 防护仍成立，不能据此推导反序在线写回执同样受保护。

## 问题

### QCACHE-001 [P2] 迟到的在线更新回执复活已经删除的缓存行

**证据**：[`QueryCacheEngine.update`](../../../packages/rxdb-plugin-querycache/src/QueryCacheEngine.ts) 收到任一远端更新回执后无条件执行 `localAdapter.upsertMany(entityName, [updatedData])`；create 有同形落缓存路径。代次门禁仅在读侧 `#pull` / `#evictOrphans` 使用，在线写回执没有同一实体操作顺序或权威版本约束。

[`QueryCachePrimaryRepository.update` / `remove`](../../../packages/rxdb-plugin-querycache/src/query-cache-primary.ts) 虽然在写完成后执行 `invalidateInflight()`，但它不能阻止更早那次 update 的回执落缓存。[`Repository.update` / `remove`](../../../packages/rxdb/src/repository/Repository.ts) 直接委托 primary，未为同一个 id 串行化这两个公开方法。

**触发**：对同一实体发起 update，服务端已经提交更新，但响应在网络中延迟；用户随后删除该实体，DELETE 及其响应先完成；最后收到较早更新的成功响应。公开调用形态是先保存更新 Promise、不 await，再 await `repository.remove(entity)`，最后 await 更新 Promise，无需调用 experimental 引擎 API。

**预期 / 实际**：远端最终已删除，本地缓存应维持不存在；实际删除先清掉缓存，迟到的更新回执再把行 upsert 回来。两个公开写调用都显示成功，远端不存在而本地暂时复活；后续重新同步可能修复，因此本条不声称永久丢失或远端行复活。

**实证**：内存转译当前真实 `QueryCachePrimaryRepository` 及其 `QueryCacheEngine`，使用真实核心 Entity 元数据与响应值解码，仅以远端回执 Subject 和本地 Map 存储作为时序接缝；Primary 自行正常清 memo 和推进在飞代次，未绕过这些保护。结果为：

```text
after primary.remove: {"remoteExists":false,"localExists":false}
after delayed primary.update: {"remoteExists":false,"localExists":true}
```

SQLite/PGlite 当前 QueryCache upsert 都是无版本条件的 ON CONFLICT 更新，没有下层隐藏的“旧回执自动忽略”保证；参见 [`RxDBAdapterSqliteBase.upsertMany`](../../../packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts) 和 [`buildQueryCacheUpsertStatements`](../../../packages/rxdb-adapter-pglite/src/query-cache/upsert_many_sql.ts)。本次诊断没有使用真实 HTTP 服务或真实数据库，证明的是生产 Primary/Engine 编排在合法反序回执下会发出错误缓存写入。

**修复建议**：将同一实体 id 的在线写请求与缓存提交按明确顺序结算，或按权威行版本/删除状态验证回执后再落缓存；不能只扩大读请求的作废范围。不同 id 仍可并行。若采用写入代次，还须定义服务器实际执行顺序与本地调用顺序不一致时的收敛规则。

**回归建议**：远端先提交更新、延迟回执，再成功删除，最后交付旧回执，断言零缓存复活；补两次更新反序回执、失败删除不误丢成功更新、不同 id 并行及普通 pull 作废的组合。

## 跨包依赖

离线队列的非 public 命名空间缺陷归属 [rxdb-plugin-sync：SYNC-001](rxdb-plugin-sync.md)，不在本包重复计数。正常在线路径已有命名空间限定，不能把两个入口混为同一个现状。

## 验证证据与边界

- 静态证据：逐一读取上述符号的实现，并沿对应调用链核对；未修改产品代码或既有测试。
- 发现仓库测试文件 16 份；文件数仅描述现有测试入口，不等于本次覆盖率。
- 本次 `rxdb-plugin-querycache:test`：206 passed (206)；目标实际执行。命令及整体边界见[总索引](README.md)。
- 已对真实 Primary/Engine 完成 QCACHE-001 的反序在线写回执诊断；既有基线用例通过不覆盖该新增场景。已审查稳定生产路径及关键引擎分支，未证明任意第三方适配器满足 QueryCache 契约。直接 new QueryCacheEngine 已标 experimental，生产外的独立用法不升级为兼容承诺。
