# rxdb-plugin-sync 深度评审

- 包：`@aiao/rxdb-plugin-sync`
- 日期：2026-10-28
- 基线：`7bb16a9014095d4003bd059244722013b36867c1`
- 结论：🟡凑合。新增确定问题见下文。

## 评审计划与实际范围

检查公开 SyncManager 入口、主检出位限制、分支切换代次、批量推拉、部分失败水位、依赖阻断与 QueryCache 离线队列重放；重点追踪数据和水位提交的顺序。

## 核查结果

- [`SyncManager.pushRepository`](../../../packages/rxdb-plugin-sync/src/SyncManager.ts) 的正常与部分失败结果均参与历史作废判断，作用域销毁会卸下事件监听和订阅。
- [`assertMergeResultCoversBatch`](../../../packages/rxdb-plugin-sync/src/push-repository.ts) 在任何本地回执写入前检查 localId 的未知、重复、缺失；跨仓按删除相位与插入相位分别排序。
- [`pullSingleRepository`](../../../packages/rxdb-plugin-sync/src/pull-repository.ts) 把本地变更应用与拉取水位更新放进同一事务；本轮不复报此前已修的 rollback 通知问题。
- [`repairLocalCache`](../../../packages/rxdb-plugin-sync/src/query-cache-outbox.ts) 修复缓存前再次查询比本轮快照更新的离线改动，避免直接覆盖新写。
- [`createResumeTrigger`](../../../packages/rxdb-plugin-sync/src/sync-listeners.ts) 只有连接就绪、可联网且位于主检出位才触发自动恢复；与名称空间参数丢失是两条不同问题。

- [`settledWatermark`](../../../packages/rxdb-plugin-sync/src/query-cache-outbox.ts) 只推进到最早未结算实体原始变更之前；交错实体导致部分已结算行可能再次处理是源码明确的现有边界。`repairLocalCache` 在远端行到达后才检查更晚待推记录，未将早已修复的“检查发生在网络往返之前”重复登记。

## 问题

### SYNC-001 [P1] 非 public 命名空间的离线写被按裸实体名重放，仍推进成功水位

**证据**：[`runOutboxFlush`](../../../packages/rxdb-plugin-sync/src/query-cache-outbox.ts) 收到 `namespace` 与 `entity`，查本地队列和 RxDBSync 行时使用两者；但 `probeRemoteMetadata(remoteAdapter, entity, ...)`、`replayPhases(..., { ..., entity, ... })`、`repairLocalCache(..., entity, ...)` 只传裸 entity。下游 `remoteWrite` 对 create/update/delete、缓存修复对 findByIds/upsertMany/deleteByIds 都继续使用这个裸值。

与之对照，[`createQueryCachePrimary`](../../../packages/rxdb-plugin-querycache/src/query-cache-primary.ts) 已实现非 public 使用 `namespace:entity` 的标识契约。因此同一实体在线写与离线后重放指向不同身份。

**触发**：HTTP 远端通过 `createRestHandlers` 配置 `resources: { Todo: 'public/todos', 'tenant_a:Todo': 'tenant_a/todos' }`；在 tenant_a 中断网新建/修改/删除，再恢复网络自动 flush。资源映射是正常公开用法，无需异常服务端行为。

**预期 / 实际**：远端与缓存修复应使用 `tenant_a:Todo`。实际调用 `Todo`：有同名公共实体时可能改错实体；远端拒绝裸名称时队列反复失败。远端接受裸名称时，本地仍把 tenant_a 的 `lastPushedChangeId` 推进，原本应送给 tenant_a 的操作之后不再重放。

**实证**：转译当前 `query-cache-outbox.ts`，复用真实核心 `compactChanges`，以本地队列/远端替身注入单条 tenant_a INSERT。实际记录 `calls=[["fetchMetadata","Todo"],["create","Todo"]], replayed=1, watermark=1`；正确标识应为 `tenant_a:Todo`。这个诊断验证真实编排的参数与水位推进，未声称已对真实 HTTP/Supabase 服务制造跨命名空间写入。

**交叉复核**：独立执行当前 HTTP [`createRestHandlers`](../../../packages/rxdb-adapter-http/src/rest.ts) 的原函数，上述资源映射中在线 `tenant_a:Todo` 请求落到 `tenant_a/todos`，重放的裸 `Todo` 落到 `public/todos`。Supabase 两个 namespace 同名时会拒绝歧义，不能把 HTTP 的确定错路由泛化成所有适配器均会写错表。

**修复建议**：在入口统一生成与 QueryCachePrimary 相同的实体标识，并传给全部远端与缓存读写；本地系统表条件继续保留独立 namespace/entity 字段。

**回归建议**：两个 namespace 下同名实体，覆盖 INSERT/UPDATE/DELETE、KEEP_REMOTE 的 upsert/drop 修复，验证公共实体完全不变；错误目标不得被计成功并推进水位。

## 验证证据与边界

- 静态证据：逐一读取上述符号的实现，并沿对应调用链核对；未修改产品代码或既有测试。
- 发现仓库测试文件 36 份；文件数仅描述现有测试入口，不等于本次覆盖率。
- 本次 `rxdb-plugin-sync:test`：500 passed (500)；目标实际执行。命令及整体边界见[总索引](README.md)。
- 已对非 public 编排做源码转译诊断；真实远端拒绝/接受裸名称的最终表现取决于适配器与服务端配置，报告按这两个结果明确区分。未跑线上同步或真实鉴权服务。
