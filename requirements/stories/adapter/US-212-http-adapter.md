---
id: US-212
title: HTTP 远程适配器
status: Backlog
priority: Medium
epic: epic-004-future-features
created: 2026-08-21
updated: 2026-08-21
tags: [adapter, http, remote, querycache]
---

<!--
INVEST 检查清单:
- [x] Independent: 关闭 US-020 之后可独立交付。不关 US-020 就发本包 = QueryCache 配置仍是空操作，写入仍污染 local changelog
- [x] Negotiable: 阶段 A 注入 handlers vs 阶段 B REST URL 模板，在 plan 可调整映射细节；协议不变量（RuleGroup JSON、不发 SQL、changelog 方法 throw）不可协商
- [x] Valuable: 已有 HTTP/REST API 的开发者今天没有 RemoteBase 可挂，只能 supabase
- [x] Estimable: 对标 supabase 的 QueryCache ducks + 分页/分块，范围收敛到一个新包
- [ ] Small: handlers 注入与 REST mapping 失败模式不同。按「交付阶段」A → B；不拆成 US-212a。Full changelog 传输是另一种 SyncType，另开故事，不是本文件阶段
- [x] Testable: ducks、分页不截断、unsupported changelog throw、不拥有 sqlite，均可单测
-->

# 用户故事：HTTP 远程适配器

## 交付阶段

| 阶段 | 交付                                                                                            | 直接前置 | AC 区段   | 状态 |
| ---- | ----------------------------------------------------------------------------------------------- | -------- | --------- | ---- |
| A    | `@aiao/rxdb-adapter-http`：RemoteBase + 注入 handlers + QueryCache ducks + 分页/分块 + 错误分类 | US-020   | AC#1～14  | ⬜   |
| B    | REST resource URL 模板、可选 ETag/If-None-Match；可选 SSE/invalidation；可选 eviction           | 阶段 A   | AC#15～18 | ⬜   |

**硬前置：[US-020](../core/US-020-querycache-repository.md)。** 阶段 A 代码可以在接线故事并行开发，**包不得在 US-020 关闭前标可发布**。否则开发者配 `SyncType.QueryCache` + HTTP + sqlite，find 仍打本地、save 仍进 sqlite changelog——比没有这个包更糟，因为它看起来「接上了」。

Full-sync changelog 传输（`pullChanges` / `mergeChanges` 真实现）是另一种 `SyncType`，**不是本文件的阶段 C**。v1 对这些方法必须 throw unsupported。

## 作为/我想要/以便

**作为** 已有 HTTP/REST JSON API、不想绑 supabase 的开发者
**我想要** 一个 `RxDBAdapterRemoteBase` 适配器，把 `RuleGroup` 当 JSON 发给远端，并用**独立注册**的 sqlite 做结构化行缓存
**以便** QueryCache 模式能打到我自己的后端，而不是把 HTTP 适配器做成「内嵌 sqlite 的第三种存储」

## 来源与边界

产品选择：**远端权威 HTTP + 独立注册 sqlite 行缓存**。仓库适配器模型只有 `adapter:local` 与 `adapter:remote` 两种 inject，没有第三种 cache adapter。HTTP **不得内部拥有 sqlite**。search / graph / encryption 绑独立 local adapter——HTTP 若自己 new 一份 sqlite，插件会绑错库。

现有唯一远程适配器是 [US-203](./US-203-supabase-adapter.md)（Done）。本故事不改 US-203，不 inherit 其 AC#6。HTTP 复制 supabase 在 QueryCache 上已经付过学费的契约：分页与分块。PostgREST `max-rows` 静默截断时，被截掉的 metadata id 会被当成「远端已删除」，变成假孤儿。HTTP 一样。

### In Scope

- 新包 `@aiao/rxdb-adapter-http`，继承 `RxDBAdapterRemoteBase`
- `ADAPTER_NAME = 'http'`；`inject: ['adapter:remote']`；`declare module` 扩 `RxDBAdapters`
- 阶段 A：handlers 注入（`fetchMetadata` / `findByIds` / 可选 `create|update|delete`）
- 请求体是 JSON `RuleGroup`，**不是 SQL**
- 分块 `findByIds`、分页 `fetchMetadata`（对标 supabase `select_all_pages` / `#findByIdsInChunks`）
- `pullChanges` / `mergeChanges` / `getChangeCount` / `pullChangesBatch` throw unsupported，**不得假空**
- 401 vs 网络错误可判别（对齐 US-020 阶段 B 的 offlineFallback 分类）
- auth hook（注入 token / header，不内置 OAuth 流程）
- 阶段 B：REST mapping、可选条件请求、可选失效与 eviction

### Out of Scope

- HTTP 内部拥有 / 创建 sqlite（产品 A，已否决）
- v1 Full changelog 同步
- Evolu XOR / CRDT
- 乐观离线写（US-020 D5：cache 模式离线只读）
- OpenAPI codegen、魔法 schema 推断
- 把 SQL 字符串发到远端
- `plugin:*` inject；encryption 当传输层
- 未定义协议的 bigint/binary remote wire（US-012 约束：不要在 HTTP JSON 里偷偷发明 codec）
- 重开 epic-002；改 US-203 的 ✅ AC
- 在 US-020 关闭前把本包标稳定/可发布

## 验收标准

### 阶段 A — handlers 远程适配器

| #   | 前置条件                                               | 操作                                                                        | 预期结果                                                                                           | 状态 |
| --- | ------------------------------------------------------ | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---- |
| 1   | US-020 已关闭；workspace 可解析新包                    | `createRxDatabase` 注册 `{ adapter: 'http', ...handlers }` 为 remote        | 适配器作为 `adapter:remote` 连接；`ADAPTER_NAME === 'http'`                                        | ⬜   |
| 2   | HTTP remote + 独立 sqlite local，`SyncType.QueryCache` | `getRepository(E).find({ where })`                                          | 远端收到 JSON `RuleGroup`，**收不到 SQL**；本地 sqlite 被 `upsertMany` 写成行缓存                  | ⬜   |
| 3   | 同上                                                   | `create` / `update` / `delete`                                              | 走 US-020 的 remote-then-local；HTTP 适配器自身不 `new` sqlite、不打开 OPFS/IDB                    | ⬜   |
| 4   | handlers 未提供 `create`                               | `repo.create(...)`                                                          | fail-fast（`QueryCacheRepository` 已有的「Remote adapter does not support create」语义），不写本地 | ⬜   |
| 5   | metadata 结果集超过单页上限                            | `fetchMetadata`                                                             | 必须翻页直到耗尽，语义同 supabase `select_all_pages`；截断的 id **不得**被当成远端已删除           | ⬜   |
| 6   | `findByIds` 的 id 列表超过单次上限                     | 增量 pull                                                                   | 分块请求，语义同 supabase `#findByIdsInChunks`；缺块不得静默当空                                   | ⬜   |
| 7   | HTTP 适配器已连接                                      | 调用 `pullChanges` / `mergeChanges` / `getChangeCount` / `pullChangesBatch` | 抛 unsupported（稳定错误码）；返回空数组 / 0 **算失败**——那会让 Full-sync 以为远端没变更           | ⬜   |
| 8   | 远端返回 HTTP 401                                      | QueryCache 读或写                                                           | 可判别鉴权错误，**不**被 US-020 的 `offlineFallback` 吞成缓存命中                                  | ⬜   |
| 9   | 网络断开                                               | 同上                                                                        | 可判别网络错误；`offlineFallback: true` 且有缓存时才降级（US-020 AC#16）                           | ⬜   |
| 10  | search / graph 插件已装，`inject: ['adapter:local']`   | 连接 HTTP + sqlite                                                          | 插件绑到独立注册的 sqlite，不绑 HTTP、不另开一份库                                                 | ⬜   |
| 11  | 一批 mutations 混入 HTTP-QueryCache 实体与 Full 实体   | `EntityManager.mutations`                                                   | 拒绝（US-020 AC#6），错误码复用 `mixed_versioned_cache_transaction`；HTTP 适配器不得绕过混批闸门   | ⬜   |
| 12  | 对照实体仍是 `SyncType.Full` + supabase 或 sqlite      | 跑既有套件                                                                  | 用户可见行为不变；本包不改 Full/Filter 写本地                                                      | ⬜   |
| 13  | 新包落地                                               | `pnpm nx lint/test/build`、api-baseline、`inject` 契约测试                  | 绿；`declare module` 扩 `RxDBAdapters`；覆盖率按非核心包 ≥ 80%                                     | ⬜   |
| 14  | 能力矩阵 / 公开文档                                    | 关闭阶段 A                                                                  | HTTP 行从「待实现」改为已实现但仍写清：v1 只支持 QueryCache，changelog 方法 unsupported            | ⬜   |

### 阶段 B — REST mapping 与可选加速

| #   | 前置条件                       | 操作                                  | 预期结果                                                             | 状态 |
| --- | ------------------------------ | ------------------------------------- | -------------------------------------------------------------------- | ---- |
| 15  | 阶段 A handlers 可用           | 用 resource URL 模板代替手写 handlers | 等价于阶段 A 的 QueryCache ducks；模板解析失败 fail-fast，不发错 URL | ⬜   |
| 16  | 远端支持 ETag / If-None-Match  | 重复 `fetchMetadata` / `findByIds`    | 304 时不把「未修改」当成空集或假孤儿                                 | ⬜   |
| 17  | 可选 SSE / invalidation 未配置 | 正常 QueryCache 查询                  | 行为与阶段 A 相同；缺可选能力不降级、不抛                            | ⬜   |
| 18  | 可选 eviction 未配置           | 行缓存增长                            | 不自动删业务行；eviction 若实现必须是显式策略，默认不丢用户数据      | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

### 产品 B，不是产品 A

HTTP 是 `RxDBAdapterRemoteBase`。sqlite 是另一个 `RxDBAdapterLocalBase`，由应用自己 `createRxDatabase({ adapters: [...] })` 注册。QueryCache 把两者配对。HTTP 构造函数里出现 `new SQLite` / OPFS / IDB 就是本故事失败。

### 必须复制的 supabase 契约

[RxDBAdapterSupabase](../../../packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts) 的 `pullBranches` 用 `select_all_pages`，注释写明：分支数超过 PostgREST `max-rows` 时单次 select 会被**静默截断**。QueryCache 的 `fetchMetadata` 同一类坑：截断的 id 变成假孤儿，再叠加 US-020 阶段 B 的真 `deleteByIds`，会把还活着的远端行从本地抹掉。

分块 `findByIds` 同理。不要发明「一次 POST 全量 id」然后在网关 413 时返回空。

### changelog 方法必须 throw

v1 不实现 Full-sync。`pullChanges` / `mergeChanges` / `getChangeCount` 若返回空，Full/Filter 会以为远端无变更并覆盖本地认知。unsupported throw 是唯一诚实行为。

### 协议

- 请求：JSON `RuleGroup` + 实体名 + id 列表。不发 SQL，远端不是你的 sqlite。
- 响应：metadata `{ id, updatedAt }[]`；实体 JSON 数组。bigint/binary 没有本故事定义的 wire codec——实体字段若声明这些类型，阶段 A 必须 fail-fast 或拒绝该实体走 HTTP，不得 `JSON.stringify` 把 `7n` 弄丢（US-018 已经在生成器上为同一类静默丢失付过学费）。
- auth：hook 注入 header。401 必须是稳定错误类型，供 US-020 `#wrapWithOfflineFallback` 识别。

### 依赖

YAML 没有 `depends-on` 字段。依赖写在这里、交付阶段表、以及 [roadmap](../../roadmap.md) 批次 3：**永远先 US-020 后 US-212**。

## 实现文件

| 文件 / 动作                                                  | 阶段 | 说明                                                        |
| ------------------------------------------------------------ | ---- | ----------------------------------------------------------- |
| `packages/rxdb-adapter-http/`（新包）                        | A    | RemoteBase 实现、handlers、分页/分块、unsupported changelog |
| Nx project / `package.json` workspace 链接                   | A    | 用 workspace 协议链接，不手改 tsconfig paths                |
| `requirements/api-baseline/`                                 | A    | 新包公开 API 基线                                           |
| `inject: ['adapter:remote']` 契约测试                        | A    | 对齐 US-015 的 adapter inject                               |
| website / [capability-matrix.md](../../capability-matrix.md) | A    | AC#14                                                       |
| REST mapping / ETag / SSE / eviction                         | B    | 可选；缺省不得改变阶段 A 语义                               |

本故事关闭前不改 US-203。能力矩阵在故事落盘时先加「待实现 / US-212」行（派生视图同步，见本次提交）；包落地后再改成已实现。

**排期约束：本包不得在 [US-306](../collaboration/US-306-working-tree-index.md) 阶段 A 的 bypass 门禁冻结前标可发布。**
本包的缓存写路径核心就是 `upsertMany()` / `deleteByIds()`，而这两个方法正是 US-306 阶段 A 要挂门禁的对象。
先发包、后收门禁，等于对一个已发布包做 breaking change；反过来先冻门禁再发包，本包只需在实现里遵守
「只对 QueryCache 实体调这两个方法」就自动合规。这条与 US-020 那条「阶段 A 关闭前不得把 HTTP 包标可发布」
是两个独立的前置，**都要满足**。

## References

- [US-020 QueryCache 接入统一 Repository](../core/US-020-querycache-repository.md) — **硬前置**
- [US-203 Supabase 适配器](./US-203-supabase-adapter.md) — 分页/分块与 QueryCache ducks 的对标；不 inherit AC
- [US-201 SQLite 适配器](./US-201-sqlite-adapter.md) / sqlite-core — 独立 local 缓存后端
- [US-015](../core/US-015-plugin-inject-dependency.md) — `inject: ['adapter:remote']`
- [US-306 FR-046](../collaboration/US-306-working-tree-index.md) — cache 排除在 working tree 外（兼容，不实现）。
  兼容的**具体机制**是：本包的缓存写路径最终落到 `upsertMany()` / `deleteByIds()`，US-306 阶段 A 会按目标实体
  `sync.type` 给这两个方法挂 bypass 门禁（[US2-AC23](../collaboration/US-306-working-tree-index.md)）——QueryCache 实体放行，
  版本化实体拒绝。本包只要**保证自己只对 QueryCache 实体调这两个方法**即可自动兼容，无须感知工作树
- [epic-004](../../epics/epic-004-future-features.md)
