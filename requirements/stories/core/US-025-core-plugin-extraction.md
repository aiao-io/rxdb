---
id: US-025
title: 核心包子系统按插件边界外移
status: Done
priority: Medium
epic: epic-004-future-features
created: 2026-09-15
updated: 2026-09-22
tags: [core, plugin, packaging]
---

# 用户故事：核心包子系统按插件边界外移

## 作为/我想要/以便

**作为** 只用本地存储、不需要同步与版本历史的接入方
**我想要** `@aiao/rxdb` 的可选子系统以插件形式按需安装
**以便** 不为用不到的能力付出包体、启动成本与拆卸复杂度

## 立项时踩得到的症状（阶段 A～E 已全部关闭）

三条都是立项时在核心包里实测的，不是架构洁癖。阶段 A～E 交付后，
`version/` 归 `@aiao/rxdb-plugin-history` 与 `@aiao/rxdb-plugin-sync`、
QueryCache 归 `@aiao/rxdb-plugin-querycache`、树归 `@aiao/rxdb-plugin-tree`，
下面引的核心代码片段**均已不在 `RxDB.ts` 里**——留着是为了记录判据，不是现状描述：

1. **可选子系统无法不装。** [`RxDB`](../../../packages/rxdb/src/RxDB.ts) 构造函数里
   `new VersionManager(this)` 是**无条件**的：

   ```ts
   this.versionManager = new VersionManager(this);
   ```

   `packages/rxdb/package.json` 的 `exports` 只有 `"."` 一个入口，`sideEffects: false` 对
   「被构造函数直接引用的类」不生效——只要 `import { RxDB }`，`version/`（11,179 行，占核心包
   非测试代码 30%）就整棵进依赖图。纯本地应用（`SyncType.None` + 只配 `local`）为它全额付费。

2. **「不需要」今天只能用 flag 表达，且表达不全。** 跨 tab 网关已经是可选的——
   [`RxDB.init()`](../../../packages/rxdb/src/RxDB.ts) 里 `if (this.#config.multiInstance !== false) this.#init_gateway();`，
   小程序接入必须写 `multiInstance: false`（见 `packages/rxdb-adapter-miniprogram/README.md`）。
   也就是说这条边界已经被承认存在，只是以配置项而非安装与否表达：代码照样进包，
   而 `version` / `QueryCache` / `tree` 连对应的 flag 都没有——三者现已各自成包，
   边界改由「装不装插件」表达。

3. **每多一个内置子系统，就多一处必须手工保持对称的拆卸。**
   [`RxDB.#shutdown()`](../../../packages/rxdb/src/RxDB.ts) 与 `init()` 的失败回滚各自逐个销毁
   `versionManager` / `#gateway` / `entityManager`，源码注释自己写明了代价：

   ```ts
   // 三个管理器的资源释放与 {@link RxDB.#shutdown} 逐条对称——它们不在连接作用域里，
   // 漏掉就没有第二个人会拆。
   ```

   走 [`IRxDBPlugin.install(scope)`](../../../packages/rxdb/src/rxdb-plugin.ts) 的子系统没有这个问题：
   撤销条目登记在作用域里，由总闸逆序释放（US-013 / US-014 已落地的原语）。

## 候选子系统与判定

行数为「位置」列所列文件的 `wc -l`（排除 `__tests__/` 与 `*.spec.ts`），核心包合计 36,986 行。
依赖边数由遍历 `packages/rxdb/src` 下全部非测试 `.ts` 的相对 `import` / `export … from` 规格得出，
出边 = 该切片依赖的核心模块数，入边 = 依赖该切片的核心模块数。

| 子系统                        | 位置                                                                                    | 行数   | 判定                                                                                             |
| ----------------------------- | --------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------ |
| QueryCache 读路径             | `repository/QueryCacheRepository.ts` `query-cache-primary.ts` `-sync-memo.ts`           | 1,541  | **已拆**（阶段 B ✅）                                                                            |
| QueryCache 写回出站           | `repository/query-cache-outbox.ts`                                                      | 837    | **已拆**（阶段 D ✅，随推拉同步）                                                                |
| 跨 tab 网关                   | `gateway/`                                                                              | 416    | **不拆**，原地作用域化（阶段 A）                                                                 |
| 历史 / 撤销重做 / 分支        | `version/HistoryManager.ts` 等                                                          | ~3,525 | **已拆**（阶段 C ✅）                                                                            |
| 推拉同步 / 冲突解决           | `version/push*.ts` `pull*.ts` `sync*.ts` `conflict.ts`                                  | 4,482  | **已拆**（阶段 D ✅）——`version/` 随阶段 C 整棵迁出核心，D 从 `@aiao/rxdb-plugin-history` 里切出 |
| 可达性 + 同步状态             | `network/` `sync-state.ts`                                                              | 449    | **留核心**——迁走的只有消费者，见「必须留在核心」                                                 |
| 树实体 + 树增量 merge         | `entity/tree-entity*.ts` `repository/TreeRepository.ts` `query/merge-update-tree.ts` 等 | 1,983  | **已拆**（阶段 E ✅）                                                                            |
| 迁移执行器                    | `system/migration*.ts`                                                                  | 378    | 不拆，见下                                                                                       |
| 元数据校验                    | `entity/metadata-validate.ts`                                                           | 534    | 不拆，**价值待证**                                                                               |
| 事务 / 实体 / Schema / 活查询 | `transaction/` `entity/` `schema/` `query/`                                             | 剩余   | **核心，不拆**                                                                                   |

### 为什么 QueryCache 必须切成两半

把 `QueryCache*` 四个文件当一个单元看，它对核心其余部分有 **25 条出边**（其中 9 条进 `version/`）、
**4 条入边**——而入边里有一条来自 `version/` 自己，
[`sync-listeners.ts`](../../../packages/rxdb-plugin-sync/src/sync-listeners.ts)：

```ts
import { countQueryCacheOutbox, flushQueryCacheOutbox } from '../repository/query-cache-outbox.js';
```

这是**双向环**：QueryCache 依赖版本子系统的水位线与冲突解决，版本子系统的同步监听又反过来驱动
QueryCache 出站。环在，「QueryCache 先走、`version/` 后走」的阶段顺序就不成立。

按读 / 写切开，环消失：

| 切片     | 行数  | 出边 | 其中进 `version/` | 入边                                              |
| -------- | ----- | ---- | ----------------- | ------------------------------------------------- |
| 读路径   | 1,541 | 13   | **0**             | 4（含 `index.ts`）                                |
| 写回出站 | 837   | 18   | **9**             | 2（`Repository.ts`、`version/sync-listeners.ts`） |

出站本来就是 **changelog 的第二个消费者**，
[`query-cache-outbox.ts`](../../../packages/rxdb-plugin-sync/src/query-cache-outbox.ts) 的文件头自己写明：

> 共用的是**队列与水位线**：出站行就是触发器已经在写的 `rxdb_change`，水位线就是
> `RxDBSync.lastPushedChangeId`（`syncType` 的联合类型里本来就有 `'querycache'`）。不同的只有提交动作。

按本故事自己的规则「搬走的是消费者，不是原语」，它归阶段 D 的 sync 插件，和 push / pull 共用同一条水位线。

### 不拆的理由

- **跨 tab 网关**：416 行、占核心 1.1%，对外只有一条出边（`rxdb-events.ts`）一条入边（`RxDB.ts`）——
  切面确实是候选表里最干净的，但**切开不减少任何依赖**：核心该引的一条不少。本故事用同一把尺子否掉了
  378 行的迁移执行器（「去掉不到 1% 的包体」），网关过不了这把尺子。附带代价还有三笔：
  `EventOrigin` 的 `'cross-tab'`、`isCrossTabEvent`、实体上的 `origin` 标记必须留在核心
  （[`rxdb.transaction.ts`](../../../packages/rxdb/src/rxdb.transaction.ts) 与
  [`VersionManager`](../../../packages/rxdb-plugin-history/src/VersionManager.ts) 在读）；
  [`RxDB.firstConnectedAt`](../../../packages/rxdb/src/RxDB.ts) 的唯一消费者是
  [`HistoryManager`](../../../packages/rxdb-plugin-history/src/HistoryManager.ts)——

  ```ts
  this.#firstConnectedAt = this.rxdb.firstConnectedAt ?? this.#sessionStartedAt;
  ```

  网关一旦成包，这就是一条 tabs 插件 → history 插件的跨插件边，又多一处 `plugin:*` 依赖；
  而 `multiInstance` 在源码里只有两个落点（`RxDB.ts` 的判定与 `rxdb.interface.ts` 的声明），
  删掉它换来的不是净减少。网关真正值钱的那一条——症状 3 的拆卸对称——**不用成包就能拿到**：
  [`RxDB.init()`](../../../packages/rxdb/src/RxDB.ts) 里连接作用域先于插件与网关建立，

  ```ts
  this.#ensure_connection_scope();
  this.#install_plugin();
  ```

  `#init_gateway()` 排在其后，把网关的建立改成向该作用域 `acquire` 一条撤销条目，`#shutdown()`
  就不必再点名它。这是阶段 A 的第二件事。

- **迁移执行器**：378 行，且 `migrations` 已在 `LIVE_BEHAVIOUR_CONFIG_KEYS` 里；拆出去要
  新增一个包、一条依赖边与一份文档，去掉不到 1% 的包体。抽象数 > 病灶数。
- **元数据校验**：`validateEntityMetadata` 是公开导出，接入方与生成器都在调；改成插件等于
  把一条编译期护栏变成「装了才有」。除非先能证明它在生产构建里确实占体积，否则不动。
- **`system/change-codec.ts` 与 changelog 原语**：`IRxDBAdapter` 已经把它写进契约
  （`getRxDBChangeSequence()`、`transaction()` 的 `localChanges` / `disableTriggers` 形参），
  sqlite-core 的 `WATCH_TABLES` 也直接列了 `rxdb$rxdb_change`。**搬走的是消费者，不是原语**。

## 两条都叫 Repository 的扩展轴

核心里有两条正交的扩展轴共用「Repository」这个词，判定表里的 QueryCache 归属与阶段 E 的树插件
都卡在这上面，先把轴分清。

**门面轴**决定 `getRepository(E)` 的**公开面**。入口是 `@Entity({ repository: 'X' })`，
[`EntityManager.init()`](../../../packages/rxdb/src/entity/entity-manager.ts) 按名查表、查不到就拒绝注册：

```ts
throw new RxDBError(`Repository '${metadata.repository}' not found for entity '${metadata.name}'`);
```

成员是 `Repository` / `TreeRepository` / `GraphRepository`，各自 `extends Repository` 并追加静态入口：

```ts
protected static override _STATIC_METHODS = [...super._STATIC_METHODS, 'get', 'findOneOrFail', 'find', …];
```

注册要两侧各来一次——宿主侧 `RxDB.repository(name, config, scope)`
（[`RxDBPluginGraph.install()`](../../../packages/rxdb-plugin-graph/src/plugin.ts) 是现成先例），
适配器侧 `this.repository('TreeRepository', SqliteTreeRepository)`。

**策略轴**决定 `Repository.primary$` 背后接哪个读写引擎，**不改公开面**。入口是 `@Entity({ sync: { type } })`，
落点是 [`Repository`](../../../packages/rxdb/src/repository/Repository.ts) 构造里那一处分支：

```ts
if (this.sync?.type === SyncType.QueryCache) {
```

成员是 `full` / `filter` / `querycache` / `remote` / `local` / `none`，没有注册表，全部写死在核心。

**`QueryCacheRepository` 在策略轴上，名字却取自门面轴。** 它不 `extends` 任何东西：

```ts
export class QueryCacheRepository<T extends EntityBaseType = EntityBaseType> {
```

不实现 `IRepository`、不进宿主的仓储配置表、`metadata.repository` 选不中它、没有 `_STATIC_METHODS`。
[`query-cache-primary.ts`](../../../packages/rxdb-plugin-querycache/src/query-cache-primary.ts) 的文件头把这条界线写死了：

> `getRepository(E)` 的公开面由 `IRepository` 与 `Repository._STATIC_METHODS` 定死 —— 8 个静态入口、
> Promise 返回、`remove(entity)`。`QueryCacheRepository` 三样都不同（2 个入口、Observable、`delete(ids)`）
> ……因此 `Repository` 仍是门面，只把 `primary$` 换成本文件的实现。

据此，阶段 B 随外移一并改名：`QueryCacheRepository` → `QueryCacheEngine`（策略轴引擎），
`QueryCachePrimaryRepository` 保留原名——它确实 `implements IRepository`，站在门面轴上。
未来新增的策略轴成员按 `*Engine` 命名，门面轴成员按 `*Repository` 命名，一个名字只属于一条轴。

**门面轴今天只对插件半开。** 注册 API 已经通了（graph 插件在跑），但两处类型是硬编码的：

```ts
repository?: 'Repository' | 'TreeRepository' | string;
```

```ts
export interface EntityMetadataFeatures {
  [name: string]: unknown;
  tree?: EntityMetadataTreeFeatures;
}
```

`tree` 在核心接口上有具名字段，`graph` 只能落到索引签名——同为门面轴成员，一个是一等公民、一个是
字符串。核心里已有现成解法，[`RxDBAdapters`](../../../packages/rxdb/src/rxdb-adapter.ts) 就是这么开的：

```ts
export interface RxDBAdapters {}
export type RxDBAdapterName = keyof RxDBAdapters | (string & {});
```

照抄成 `RxDBRepositories {}` + `RxDBRepositoryName`，把 `repository?` 换成后者，插件用
`declare module` 把自己的成员合并进来。这是阶段 A 的第一件事：**不搬任何运行时代码**，
却是阶段 E 把 `TreeRepository` 搬出核心的前置——`tree?` 那个具名字段要能跟着插件走，
首先得有一条插件能往里写的路。

## 范围边界

### In Scope

- 把上表判定为「拆」的子系统外移为独立包，经 `IRxDBPlugin` + `install(scope)` 安装
- 门面轴注册表类型化（`RxDBRepositories` / `RxDBRepositoryName`）与网关原地作用域化（阶段 A）
- 系统表判定：`RxDBBranch` / `RxDBChange` / `RxDBSync` 是 changelog 原语，**留在核心**照常由 `SchemaManager.init()` 建表（见「必须留在核心」）
- 三框架绑定与 DevTools 随之调整，保持 Angular / React / Vue API 对称
- 每阶段更新 `requirements/api-baseline/` 基线与迁移文档

### Out of Scope

- 改变任一子系统的**行为语义**——这是搬家，不是重写；行为变更另开故事
- `gateway/` 外移为独立包（判定与理由见「不拆的理由」）
- 把策略轴也开成注册表（`SyncType` / `SyncOptions` 仍闭合，见「必须留在核心」）
- 适配器侧的 changelog 原语与 `*TreeRepository` 子类（留在适配器包内）
- `packages/rxdb` 拆子路径导出（subpath）——本故事走独立包，不走 `exports` 分叉
- 事务、实体、Schema、活查询合并引擎

## 交付阶段

| 阶段 | 交付                                                            | 直接前置                                    | AC 区段 | 状态 |
| ---- | --------------------------------------------------------------- | ------------------------------------------- | ------- | ---- |
| A    | 门面轴注册表类型化 + 网关原地作用域化（核心内整形，零代码迁出） | 无                                          | A1～A4  | ✅   |
| B    | QueryCache 读路径外移                                           | 无                                          | B1～B5  | ✅   |
| C    | 历史 / 撤销重做 / 分支外移                                      | `plugin:*` 依赖解析（US-015 阶段 B 已交付） | C1～C6  | ✅   |
| D    | 推拉同步 / 冲突 / 可达性 + QueryCache 写回出站外移              | 阶段 B + 阶段 C                             | D1～D6  | ✅   |
| E    | 树实体 + 树增量 merge 外移                                      | 阶段 A                                      | E1～E4  | ✅   |

阶段 D 从 `@aiao/rxdb-plugin-history` 里切出 `@aiao/rxdb-plugin-sync`——`version/` 在阶段 C
已整棵迁出核心，阶段 D 不再从核心切。可达性与 `SyncStateHub` 留在核心（见「必须留在核心」），
迁走的只有它们的消费者。阶段 E 把树实体、树仓储与约 1,100 行树专属增量 merge 整体搬进
`@aiao/rxdb-plugin-tree`，并同步新增三个框架绑定包（见「前置与阻塞」下的排序说明）。

## 验收标准

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

### 阶段 A

| #   | 前置条件               | 操作                                       | 预期结果                                                                                          | 状态 |
| --- | ---------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------- | ---- |
| A1  | 装 `rxdb-plugin-graph` | 在 `@Entity({ repository: … })` 处取补全   | 候选含插件经 `declare module` 注册的 `'GraphRepository'`；核心 `repository?` 不再硬编码字面量联合 | ✅   |
| A2  | 声明一个未注册的仓储名 | `init()`                                   | 仍按 `Repository '<name>' not found for entity '<entity>'` 抛错——类型放宽不得削弱运行期护栏       | ✅   |
| A3  | `multiInstance` 未关闭 | `disconnectAll()`                          | 网关经连接作用域逆序释放；`RxDB.#shutdown()` 里不再有点名 `#gateway` 的销毁代码                   | ✅   |
| A4  | 阶段 A 完成            | 核对 `requirements/api-baseline/rxdb.json` | 零运行时代码迁出核心；基线只新增 `RxDBRepositories` / `RxDBRepositoryName`，无删除项（非破坏性）  | ✅   |

### 阶段 B

| #   | 前置条件                         | 操作                                        | 预期结果                                                                                                         | 状态 |
| --- | -------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---- |
| B1  | 应用只配 `SyncType.None` + local | 构建产物并核对依赖图                        | `QueryCacheEngine` / `query-cache-primary` / `query-cache-sync-memo` 均不在图内                                  | ✅   |
| B2  | 装 `rxdb-plugin-querycache`      | 实体声明 `SyncType.QueryCache`、`connect()` | 读路径行为与外移前逐条一致（复用 US-020～024 测试，仅改 import）                                                 | ✅   |
| B3  | 未装 querycache 插件             | 实体声明 `SyncType.QueryCache`、`connect()` | 在 `connect()` 阶段抛出点名缺失插件的错误，不静默降级为本地读                                                    | ✅   |
| B4  | 装 querycache 插件               | 离线写入后重新联网                          | 出站仍由核心的 `query-cache-outbox.ts` 提交（阶段 B 不动写回路径；阶段 D 后改由 sync 插件驱动，见 D5），行为不变 | ✅   |
| B5  | 阶段 B 完成                      | 核对插件包依赖                              | 插件包对 `version/` 零依赖（读路径 13 条出边无一进 `version/`）；`SyncType.QueryCache` 仍留核心                  | ✅   |

**测试数**：`rxdb` 140 文件 / 2,585 条，`rxdb-plugin-querycache` 12 文件 / 193 条，
合计 2,778 ≥ 搬迁前 `rxdb` 的 2,764（B2 判据）。

### 阶段 C

| #   | 前置条件                           | 操作                       | 预期结果                                                                                                                                                                                          | 状态 |
| --- | ---------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| C1  | 插件 X 声明 `inject: ['plugin:y']` | `init()`                   | Y 进入 `active` 后 X 才安装；Y 缺席时 X 停在等待态并 warn，`connect()` 不挂起                                                                                                                     | ✅   |
| C2  | 未装 history 插件                  | `connect()`                | `versionManager` 槽位不存在、历史 / 分支 API 不可达；本地 CRUD 与「触发器 → `handle_rxdb_change` → `QueryManager`」增量链路照常；`RxDBBranch` / `RxDBChange` 系统表照建（changelog 原语，留核心） | ✅   |
| C3  | 装 history 插件                    | 写入后 `undo()` / `redo()` | 行为与外移前一致（复用 US-301 / US-302 / US-307 测试）                                                                                                                                            | ✅   |
| C4  | 装 history 插件                    | 建分支、切分支、合并分支   | 行为与外移前一致（复用 US-305 / US-308 测试）                                                                                                                                                     | ✅   |
| C5  | 未装 history 插件                  | 访问 `rxdb.versionManager` | 运行期读到 `undefined` 而非半截对象；类型上该槽位由插件 `declare module` 合并而来——注意 TS 的模块增强是**程序级**的，编译单元里任何一处导入插件，整个程序都看得见它                               | ✅   |
| C6  | 三框架 demo                        | 撤销重做 UI 操作           | Angular / React / Vue 三端 API 与行为对称                                                                                                                                                         | ✅   |

**测试数**：`rxdb` 98 文件 / 1,952 条，`rxdb-plugin-history` 47 文件 / 683 条，
合计 2,635 ≥ 搬迁前 `rxdb` 的 2,585（C3 / C4 判据）。

### 阶段 D

| #   | 前置条件                                        | 操作                            | 预期结果                                                                                                                     | 状态 |
| --- | ----------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---- |
| D1  | 装 sync 插件（其 `inject` 含 `plugin:history`） | `push()` / `pull()` / `sync()`  | 行为与外移前一致（复用现有 push/pull 契约测试）                                                                              | ✅   |
| D2  | 未装 sync 插件、只配 local                      | `connect()`                     | `reachability` 不往 `globalThis` 挂监听（`watch()` 引用计数，无订阅者时零监听）；`RxDBSync` 表照建（changelog 原语，留核心） | ✅   |
| D3  | 核心 `Repository`                               | 构造 QueryCache 主仓储          | 核心不再值导入 `pendingQueryCacheWriteIds`——待提交写的查询改由插件注入                                                       | ✅   |
| D4  | 装 sync 插件                                    | 断网后恢复                      | 退避重放与 `syncState` 面板数字与外移前一致                                                                                  | ✅   |
| D5  | 装 sync + querycache 插件                       | QueryCache 实体离线写、恢复联网 | `flushQueryCacheOutbox` 由 sync 插件驱动，水位线仍是 `RxDBSync.lastPushedChangeId`，与 push 共用                             | ✅   |
| D6  | 装 sync、未装 querycache，无 QueryCache 实体    | `connect()`                     | 正常运行——两包间连类型边都没有（`QueryCacheRemoteAdapter` 由核心导出，各自从 `@aiao/rxdb` 取），不产生 `inject` 运行期依赖   | ✅   |

**`SyncType.QueryCache` 实体需要三个插件**：`rxdb-plugin-querycache`（读引擎）+
`rxdb-plugin-sync`（出站队列）。`QueryCacheOutboxProvider` 槽位不能缺席退化成空集（空集的含义是
「没有任何 id 被离线写占着」，对账会把每条离线写当孤儿删掉），核心因此在 `connect()` 直接抛
`RxDBMissingPluginError`；而 sync 插件 `inject` 历史插件，实到是三个。

**测试数**：`rxdb` 97 文件 / 1,930 条，`rxdb-plugin-history` 22 文件 / 316 条，
`rxdb-plugin-sync` 32 文件 / 423 条，合计 2,669 ≥ 阶段 C 收尾时的 2,635。
其中 history + sync = 739 ≥ 拆分前历史插件的 683；核心少掉的 1 文件 / 22 条正是
`query-cache-outbox.spec.ts` 整份搬进新包——它的 75 条断言与搬迁前**逐字相同**（D5 判据），
`sync-listeners.spec.ts` 的 74 条只动两处（一条随 `isIgnorableDetachedVersionEventError`
回到历史侧，一条是第 11 项的 console 前缀），三框架 `use-sync-state` 规格一字未改（D4 判据）。

**覆盖率**：`rxdb` 93.64 / 91.22 / 94.45 / 94.57（四项 ≥ 90 核心门禁），
`rxdb-plugin-history` 97.93 / 93.24 / 98.23 / 98.50，
`rxdb-plugin-sync` 93.92 / 86.45 / 96.07 / 94.76（四项 ≥ 80 公共包门禁）。

### 阶段 E

| #   | 前置条件                     | 操作                   | 预期结果                                                                         | 状态 |
| --- | ---------------------------- | ---------------------- | -------------------------------------------------------------------------------- | ---- |
| E1  | 装 tree 插件                 | `@TreeEntity` 增删改查 | 行为与外移前一致（复用 US-010 测试）                                             | ✅   |
| E2  | 未装 tree 插件               | 声明 `@TreeEntity`     | 注册阶段抛错点名缺失插件                                                         | ✅   |
| E3  | 各适配器的 `*TreeRepository` | 经插件注册路径装配     | 六个适配器均不需为此改公开 API                                                   | ✅   |
| E4  | 未装 tree 插件               | `connect()` 并建系统表 | `RxDBBranch` 建表成功——它已不是树实体；`EntityMetadataFeatures.tree?` 已随插件走 | ✅   |

**E3 的判据是零 diff**：`pnpm audit:api-surface:update` 后，六个适配器的基线文件
（`rxdb-adapter-{pglite,sqlite-core,sqlite,sqliteai,supabase,wa-sqlite}.json`）
一个字节未变——适配器只换了 `ITreeRepository` / `FindTreeOptions` / `assertTreeLevel`
的 import 来源，类名与签名原样。`case 'TreeRepository'` 的字符串分发也一行未动：
插件注册的仓储名仍是 `'TreeRepository'`。

**破坏性变更落在三框架绑定包**（AC E3 只护适配器）：`@aiao/rxdb-{angular,react,vue}`
各删 4 个导出（`useFindDescendants` / `useCountDescendants` / `useFindAncestors` /
`useCountAncestors`），迁往 `@aiao/rxdb-plugin-tree-{angular,react,vue}`，
三端同名同形。换线步骤见[树结构拆包](../../../website/docs/migration/tree-split.md)。

**核心瘦身实测**：`packages/rxdb/src` 非测试代码净减 1,731 行（删 1,983 / 加 252），
测试净减 7,361 行（删 7,748 / 加 387）。迁出的不只是 474 行实体与仓储——
`query/merge-update-tree.ts`（648）、`query/tree-helper.ts`（289）、
`query/query-tree.utils.ts`（160）这约 1,100 行树专属增量 merge 才是大头，
它们此前从 `merge_{create,update,remove}` 三个永远加载的 switch 里可达，
不用树的应用一行也甩不掉。落到新包是 2,184 行源码（`@aiao/rxdb-plugin-tree`）
加三个框架绑定包 115 / 91 / 89 行。

**核心公开 API 净 +7**（516 → 523）：删 11 个树符号
（`TreeEntity` / `TreeAdjacencyListEntityBase` / `TREE_ADJACENCY_LIST_ENTITY_BASE_OPTIONS` /
`TREE_MAX_LEVEL` / `assertTreeLevel` / `ITreeEntity` / `ISortableTreeEntity` /
`ITreeRepository` / `TreeEntityType` / `FindTreeOptions` / `EntityMetadataTreeFeatures`），
加 12 个增量 merge 与指纹原语（`UpdateDataCache` / `UpdateClassification` /
`IncrementalUpdateContext` / `prepareIncrementalUpdate` / `applyExternalEntityUpdate` /
`getEntityId` / `isStaleEntityEvent` / `isStaleEntityRemoveEvent` / `Fingerprint` /
`getFingerprintPrimitive` / `getFingerprintByEntity` / `getFingerprintByEntities`），
外加新开的 `@aiao/rxdb/testing` 子入口 6 个符号（插件测试要复用核心的 harness）。
**这是本阶段付出的代价**：merge 引擎的内部原语从此进基线、受兼容承诺约束。

> 后续修订：`TREE_MAX_LEVEL` 已在「树查询默认不限深度」一轮中从 `@aiao/rxdb-plugin-tree` 删除
> （默认不再限制深度后，显式 `level` 的 100 上限不再自洽）。上面这份符号清单记录的是
> US-025 当时的迁移范围，不随后续增删改写。
> 换来的是插件能做**真增量** merge——图插件当年一律 `refresh()`，树不能，
> 四个树查询的 43 + 34 + 26 + 43 条 handler 断言全靠这批原语才搬得动。

**测试数**：10 个核心树 spec 整体搬入插件，221 条断言**逐条不变**（E1 判据），
插件另补 5 份新 spec（10 条）——含 AC E2 的
[`missing-plugin-error.browser.spec.ts`](../../../packages/rxdb-plugin-tree/src/__tests__/contracts/missing-plugin-error.browser.spec.ts)：
只装核心声明 `@TreeEntity` 时 `init()` 同步抛错，消息三段齐全（缺哪个名字 / 现有哪些名字 /
下一步 `rxdb.use(...)`），且**不点名任何插件包**。合计 15 文件 / 231 条。
三框架插件包各 4 个 hook、三端同名同形。

**覆盖率**：`rxdb` 92.57 / 90.08 / 92.58 / 93.59（四项 ≥ 90 核心门禁），
`rxdb-plugin-tree` 93.16 / 90.88 / 97.33 / 94.14，
`rxdb-plugin-tree-{angular,react,vue}` 三端均 100 / 100 / 100 / 100（四项 ≥ 80 公共包门禁）。

## 前置与阻塞

### `plugin:*` 依赖解析（阶段 C / D 的前置，已具备）

sync 插件必须排在 history 插件之后——两者共用 changelog 水位。这条「插件依赖插件」的能力由
[US-015](./US-015-plugin-inject-dependency.md) 阶段 B 提供，阶段 C / D 正是它的消费方。

可用的形状：`inject: ['plugin:history']` 让 sync 插件等到 history 插件**装好**（不只是注册）
才开始安装；释放走逆拓扑序，sync 先于 history 撤销；同层内仍是 `use()` 的逆序。依赖成环与名字
歧义在 `use()` 同步抛 `RxDBPluginDependencyCycleError` / `RxDBPluginAmbiguousDependencyError`，
不进半装状态。用法见[插件作者文档](../../../website/docs/plugins/authoring.md)，
契约见 US-015 的 INV-1～7 与 D3 / D4。
注意 `rxdb.init()` 是同步的：`inject` 把安装推迟到提供方就绪后，`init()` 返回时安装可能尚未落地——
等待插件就绪的公开结算点是 `await rxdb.connect(<adapterName>)`，它对已连接的适配器同样有效，
会重跑插件等待。

### 排序能力仍挂在树接口下（遗留债，不阻塞）

`ISortableTreeEntity` 随树一起搬进了 `@aiao/rxdb-plugin-tree`，因此**非树实体的排序需求
今天要装 tree 插件才能满足**——这与「按需安装」相悖，但不构成阶段 E 的阻塞：
`sortOrder` 在核心与 `rxdb-model` 里零实现、零读取，运行期没有任何东西跟着被拖走，
迁走的只是一个类型声明。

[US-028](./US-028-sortable-entity.md)（Backlog）要新增与 `ITreeEntity` 平行的
`ISortableEntity`，`ISortableTreeEntity` 改为同时继承两者、名字不变。排序模块已定案放在核心
（查询默认排序与 create 追加键都在引擎写路径上），树插件本来就依赖 `@aiao/rxdb`，依赖方向天然是
树 → 核心，与阶段 E 没有先后约束。

## 技术笔记

**机制已经就绪的部分**（不需要新原语，照抄现有插件的做法即可）：

- **插件可注册实体**：`LIVE_BEHAVIOUR_CONFIG_KEYS` 是 `new Set(['entities', 'migrations'])`，
  `freezeConfig()` 整棵跳过这两项，所以插件能在 `install(scope)` 里往 `rxdb.config.entities` 推类并登记撤销。
  `RxDBPluginStorage.install()` 的 `'storage:entity'` 条目就是现成先例。
- **插件可注册仓储实现**：`RxDB.repository(name, config, scope)` 第三个形参接作用域。
  `EntityManager` 今天注册 `TreeRepository` 走的正是这个 API，阶段 E 只是把调用方从
  `EntityManager` 换成插件。
- **安装时序**：`RxDB.init()` 里 `#install_plugin()` 排在 `schemaManager.init()` **之前**，
  所以插件推进去的实体赶得上建表。

**必须留在核心的部分**：

- **changelog 原语与三张系统表**：写入是适配器责任而非上层责任——`IRxDBAdapter.transaction()`
  的 `localChanges` / `disableTriggers` 形参、`getRxDBChangeSequence()`、以及 sqlite-core 的
  `WATCH_TABLES` 都已把 `RxDBChange` 写进适配器契约；changelog 触发器无条件写 `branchId`，
  `RxDBChange.branch` 是真实外键（`rxdb-adapter-sqlite-core` 的 `trigger_sql.ts` /
  `create_table_sql.ts`），没有分支表就建不出变更表。本故事搬的是**消费者**（历史、撤销、
  分支、推拉、冲突解决、QueryCache 出站），原语与表结构留在 `@aiao/rxdb` + 适配器：
  `RxDBBranch` / `RxDBChange` / `RxDBSync` 三张系统表照建，
  [`system/system-repositories.ts`](../../../packages/rxdb/src/system/system-repositories.ts)
  （`getLocalSystemRepositories` / `getRemoteSystemRepositories` / `getCurrentBranch` /
  `resolve_current_branch`）与 `sync-contract/`（冲突模型、变更编解码、「哪些仓储可推」的判定）
  随之留核心。
- **`SyncStateHub`**：留核心（三框架 `useSyncState` 绑 `rxdb.syncState`），插件经
  `install(scope)` 接上 `bindPushableCount(source$)` / `requestPullableRefresh()` /
  `bindPullableRefresh(fn)` 回填数字，作用域释放时退订。
- **可达性监视器**：`ReachabilityMonitor` 留核心（`RxDBAdapterSupabase` 与核心 `Repository`
  都在消费它），监听由 `watch()` 开、`release()` 关，按引用计数，计数归零即摘干净；插件经
  `scope.acquire(...)` 持有。
- **`SyncType` 与 `SyncOptions` 闭合**：策略轴没有注册表，枚举成员与联合分支都写死在核心——

  ```ts
  export type SyncOptions = SyncFull | SyncFilter | SyncQueryCache | Remote | Local | SyncDisabled;
  ```

  阶段 B 搬走的是 QueryCache 的**实现**，`SyncType.QueryCache` 这个成员留下，否则 `Repository`
  构造里那处分支无从判定。代价是核心保留一个指向「可能没装的插件」的枚举值——B3 那条运行期报错
  就是为它准备的。

- **五个 QueryCache 适配器原语**：`RxDBAdapterLocalBase` 上的 `getMetadataByIds` / `upsertMany` /
  `deleteByIds` 与 `RxDBAdapterRemoteBase` 上的 `fetchMetadata` / `findByIds` 全是抽象成员——

  ```ts
  abstract fetchMetadata(entityName: string, query: RuleGroup<unknown>): Observable<QueryCacheEntityMetadata[]>;
  ```

  与 changelog 原语同一性质，属适配器契约。因此 B1「依赖图里没有 QueryCache」能过，但**六个适配器
  仍要实现这五个方法**，适配器侧的包体不因阶段 B 变小。

**归属已定（阶段 B 开工时结的两处）**：[`RxDBAdapterHttp`](../../../packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts)
v1 只服务一种同步类型——

```ts
readonly reason = 'v1 supports SyncType.QueryCache only'
```

**两处都不动**：

- `rxdb-adapter-http` 留在适配器序列。它实现的是 `RxDBAdapterRemoteBase` 的 `fetchMetadata` /
  `findByIds` 两个 abstract 原语，按本故事「搬走的是消费者，不是原语」的规则属适配器契约；
  它对 `QueryCacheRepository` / `query-cache-primary` / `query-cache-sync-memo` 零 import
  （只有上面那句文案提到 `SyncType.QueryCache`），搬走不减任何一条边。
- `packages/rxdb-test/src/query-cache-contract/` 留在 `rxdb-test`。它是 `runQueryCacheRowContractSuite`
  ——适配器**行契约**（upsert 行形状），消费者是 `rxdb-adapter-pglite` 与 `rxdb-adapter-sqlite-core`，
  与读路径无关；挪进插件包等于让这两个适配器包依赖 querycache 插件。

**连带成本**（排期时不要漏）：

- `requirements/api-baseline/rxdb.json` 单入口 `.` 原有 440 条导出（阶段 B 后 452、阶段 C 后 460、
  阶段 D 后 457），阶段 B 起每个阶段都会动基线，
  且按 [versioning-policy.md](../../versioning-policy.md) 属破坏性变更（阶段 A 例外，只增不删）；
- 三框架绑定**不直接**引用 `versionManager`（`rxdb-angular` / `rxdb-react` / `rxdb-vue`
  的源码里零命中）——`useSyncState` 绑的 `rxdb.syncState` 没动：Hub 留核心、插件只回填数字；
- `rxdb-devtools` 的 `connector.ts` 与 `rxdb/database-provider.ts` 读 `versionManager`，
  经 `DevToolsRxDB.versionManager` 可选成员 + 手写的 `DevToolsVersionManager` 接口
  （见 `requirements/api-baseline/rxdb-devtools.json`）；DevTools 读的三个分支操作全在历史半区，
  不依赖同步半区；
- demo 应用（`dev-rxdb-angular` / `dev-rxdb-supabase` / `dev-rxdb-electron` 的 branch-manager
  与 todo 页）直接调 `versionManager`，是改造的实际验收面。推拉 API 现位于 `rxdb.syncManager`
  （撤销重做 / 分支 / 计数流留 `rxdb.versionManager`）。
- 适配器包的 `typecheck` 只跑 `tsc --build tsconfig.lib.json --emitDeclarationOnly`，不覆盖
  `*.spec.ts`——构造函数改签名这类破坏在 `typecheck` 上一声不响，全量测试才暴露。

**Epic 归属存疑**：挂在 `epic-004-future-features` 下是权宜——该 Epic 的愿景是「全文搜索、
桌面原生文件存储等中长期能力」，而本故事是核心包重构，不是用户可见能力。真要承诺交付，
按 [epic-007 的自述理由](../../epics/epic-007-public-api-gates.md#为什么单列一个-epic)，
它更应当另开一个「核心瘦身」Epic。

## 实现文件

| 阶段 | 新增包                                                                          | 迁出自 / 就地改动                                                                                                                                                                                                                                                                                                                                               |
| ---- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A    | 无                                                                              | 就地：`entity/entity-options.interface.ts`、`rxdb-adapter.ts`（注册表模板）、`RxDB.ts`（网关作用域化）                                                                                                                                                                                                                                                          |
| B    | `packages/rxdb-plugin-querycache/`                                              | `packages/rxdb-plugin-querycache/src/QueryCacheEngine.ts` `query-cache-primary.ts` `query-cache-sync-memo.ts`                                                                                                                                                                                                                                                   |
| C    | `packages/rxdb-plugin-history/`                                                 | `packages/rxdb/src/version/`（**整棵**，含推拉半区）；核心留下 `system/system-repositories.ts` 与 `sync-contract/`                                                                                                                                                                                                                                              |
| D    | `packages/rxdb-plugin-sync/`                                                    | `packages/rxdb-plugin-history/src/`（`push*.ts` `pull*.ts` `sync*.ts`）+ `packages/rxdb/src/repository/query-cache-outbox.ts`；`network/` 与 `sync-state.ts` **留核心**                                                                                                                                                                                         |
| E    | `packages/rxdb-plugin-tree/` + `packages/rxdb-plugin-tree-{angular,react,vue}/` | `packages/rxdb/src/entity/tree-entity*.ts` + `repository/TreeRepository.ts` + `repository/tree-level.utils.ts` + `query/{merge-update-tree,tree-helper,query-tree.utils}.ts`；三框架的四个树 hook 从 `packages/rxdb-{angular,react,vue}/src/hooks.ts` 迁出；`website/project.json` 的 `api-docs` 预构建列表补 `rxdb-plugin-tree-angular`（净树上不补会 TS6305） |

受影响但不迁移：`packages/rxdb/src/RxDB.ts`、`packages/rxdb/src/gateway/`、`packages/rxdb-devtools/`、
三框架绑定包、`packages/rxdb-test/`、`apps/dev-rxdb-*`。

## References

- [US-015 插件 inject 依赖](./US-015-plugin-inject-dependency.md) — `plugin:*` 解析的前置
- [US-014 插件作用域契约](./US-014-plugin-scope-contract.md) — `install(scope)` 拆卸语义
- [US-020 QueryCache 仓储](./US-020-querycache-repository.md) — 阶段 B 的行为基线
- [US-009 跨 tab 同步](./US-009-cross-tab-sync.md) — 网关的行为基线（阶段 A 只改拆卸路径）
- [US-010 树实体](./US-010-tree-entity.md) — 阶段 E 的行为基线
- [US-301 版本控制](../collaboration/US-301-version-control.md) / [US-302 撤销重做](../collaboration/US-302-undo-redo.md) — 阶段 C 的行为基线
- [versioning-policy.md](../../versioning-policy.md) — 公开 API 破坏性变更流程
- RV-015（已收口并删除，见 [reviews/README.md](../../reviews/README.md) 的 2026-09-23 条）— 阶段 E 把 `TreeRepositoryGenerator`
  留在 `@aiao/rxdb-client-generator` 的理由，以及后续搬进 `@aiao/rxdb-plugin-tree/generator` 的破坏性迁移

---

> 写作规范（证据锚点 / 结论复验 / 大故事分阶段 / 价值待证）、命名与状态约定见
> [CONVENTIONS.md](../../CONVENTIONS.md)。
