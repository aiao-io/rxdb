# rxdb-plugin-querycache 深度评审

- 包：`@aiao/rxdb-plugin-querycache`
- 日期：2026-10-28
- 基线：`7bb16a9014095d4003bd059244722013b36867c1`
- 结论：🟢好。本次已审范围未发现新增确定缺陷；不代表全部路径无缺陷。

## 评审计划与实际范围

从稳定生产入口 `createQueryCachePrimary` 追到增量引擎，重点检查离线写、远端响应解码、SWR、在飞去重、作废代次、出站队列保护和 memo 生命周期。

## 核查结果

- [`createQueryCachePrimary`](../../../packages/rxdb-plugin-querycache/src/query-cache-primary.ts) 对非 `public` 命名空间使用 `namespace:entity` 标识，避免正常在线请求落到同名公共实体。
- [`QueryCachePrimaryRepository.create`](../../../packages/rxdb-plugin-querycache/src/query-cache-primary.ts)、`update`、`remove` 在成功写后同时清 memo 与在飞代次；远端回包经过 `parseEntityRecordValues` 解码。
- [`QueryCacheEngine.find`](../../../packages/rxdb-plugin-querycache/src/QueryCacheEngine.ts) 的 finalize 按 Observable 身份清理去重表；`onRemoteError` 广播给共享请求的所有消费者。
- [`QueryCacheEngine.findById`](../../../packages/rxdb-plugin-querycache/src/QueryCacheEngine.ts) 在首次远端请求前捕获作废代次；拉取写入通过同一代次门禁，不能直接复报已修的旧响应覆盖问题。
- [`QueryCacheSyncMemo.remember`](../../../packages/rxdb-plugin-querycache/src/query-cache-sync-memo.ts) 拒绝旧 generation 写回，过期定时器可清理。
- [`RxDBPluginQueryCache.install`](../../../packages/rxdb-plugin-querycache/src/plugin.ts) 把引擎工厂的注册绑定作用域；没有杜撰一个不存在的 `rxdb.queryCache` 运行时属性。

## 问题

本次未发现可给出确定触发链的新增包内问题。

## 跨包依赖

离线队列的非 public 命名空间缺陷归属 [rxdb-plugin-sync：SYNC-001](rxdb-plugin-sync.md)，不在本包重复计数。正常在线路径已有命名空间限定，不能把两个入口混为同一个现状。

## 验证证据与边界

- 静态证据：逐一读取上述符号的实现，并沿对应调用链核对；未修改产品代码或既有测试。
- 发现仓库测试文件 16 份；文件数仅描述现有测试入口，不等于本次覆盖率。
- 本次 `rxdb-plugin-querycache:test`：206 passed (206)；目标实际执行。命令及整体边界见[总索引](README.md)。
- 已审查稳定生产路径及关键引擎分支，未证明任意第三方适配器满足 QueryCache 契约。直接 new QueryCacheEngine 已标 experimental，生产外的独立用法不升级为兼容承诺。
