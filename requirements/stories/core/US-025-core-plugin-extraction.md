---
id: US-025
title: 核心包子系统按插件边界外移
status: In Progress
priority: Medium
epic: epic-004-future-features
created: 2026-09-15
updated: 2026-09-15
tags: [core, plugin, packaging]
---

# 用户故事：核心包子系统按插件边界外移

## 作为/我想要/以便

**作为** 只用本地存储、不需要同步与版本历史的接入方
**我想要** `@aiao/rxdb` 的可选子系统以插件形式按需安装
**以便** 不为用不到的能力付出包体、启动成本与拆卸复杂度

## 今天踩得到的症状

三条都可一次跳转复验，不是架构洁癖：

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
   而 `version` / `QueryCache` / `tree` 连对应的 flag 都没有。

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

| 子系统                        | 位置                                                                          | 行数   | 判定                                                                                    |
| ----------------------------- | ----------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------- |
| QueryCache 读路径             | `repository/QueryCacheRepository.ts` `query-cache-primary.ts` `-sync-memo.ts` | 1,541  | **已拆**（阶段 B ✅）                                                                   |
| QueryCache 写回出站           | `repository/query-cache-outbox.ts`                                            | 837    | **已拆**（阶段 D ✅，随推拉同步）                                                       |
| 跨 tab 网关                   | `gateway/`                                                                    | 416    | **不拆**，原地作用域化（阶段 A）                                                        |
| 历史 / 撤销重做 / 分支        | `version/HistoryManager.ts` 等                                                | ~3,525 | **已拆**（阶段 C ✅）                                                                   |
| 推拉同步 / 冲突解决           | `version/push*.ts` `pull*.ts` `sync*.ts` `conflict.ts`                        | 4,482  | **已拆**（阶段 D ✅）——代码随阶段 C 先整棵迁出核心，D 从历史插件里切出，见阶段 C 偏差 1 |
| 可达性 + 同步状态             | `network/` `sync-state.ts`                                                    | 449    | **留核心**——阶段 D 只搬消费者，见阶段 D 偏差 2                                          |
| 树实体                        | `entity/tree-entity*.ts` `repository/TreeRepository.ts` + tree 工具           | 474    | 阶段 E，**价值待证**                                                                    |
| 迁移执行器                    | `system/migration*.ts`                                                        | 378    | 不拆，见下                                                                              |
| 元数据校验                    | `entity/metadata-validate.ts`                                                 | 534    | 不拆，**价值待证**                                                                      |
| 事务 / 实体 / Schema / 活查询 | `transaction/` `entity/` `schema/` `query/`                                   | 剩余   | **核心，不拆**                                                                          |

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
- 系统表随插件注册：`RxDBBranch` / `RxDBChange` / `RxDBSync` 不再由 `SchemaManager.init()` 无条件注入
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
| E    | 树实体外移                                                      | 阶段 A + `RxDBBranch` 去树化                | E1～E4  | ⬜   |

阶段 D 已交付，切割面与计划不同——`version/` 已随阶段 C 整棵迁出核心，阶段 D 是
**从 `@aiao/rxdb-plugin-history` 里**切出 `@aiao/rxdb-plugin-sync`，理由见阶段 C 的偏差 1。
可达性与 `SyncStateHub` 按同一条规则**留在核心**（见阶段 D 偏差 2），迁走的只有它们的消费者。
阶段 E 的前置不在本故事的任一阶段里——`RxDBBranch` 去树化是一段独立工作，见「前置与阻塞」。

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

| #   | 前置条件                         | 操作                                        | 预期结果                                                                                        | 状态 |
| --- | -------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---- |
| B1  | 应用只配 `SyncType.None` + local | 构建产物并核对依赖图                        | `QueryCacheEngine` / `query-cache-primary` / `query-cache-sync-memo` 均不在图内                 | ✅   |
| B2  | 装 `rxdb-plugin-querycache`      | 实体声明 `SyncType.QueryCache`、`connect()` | 读路径行为与外移前逐条一致（复用 US-020～024 测试，仅改 import）                                | ✅   |
| B3  | 未装 querycache 插件             | 实体声明 `SyncType.QueryCache`、`connect()` | 在 `connect()` 阶段抛出点名缺失插件的错误，不静默降级为本地读                                   | ✅   |
| B4  | 装 querycache 插件               | 离线写入后重新联网                          | 出站仍由核心的 `query-cache-outbox.ts` 提交（阶段 B 不动写回路径），行为不变                    | ✅   |
| B5  | 阶段 B 完成                      | 核对插件包依赖                              | 插件包对 `version/` 零依赖（读路径 13 条出边无一进 `version/`）；`SyncType.QueryCache` 仍留核心 | ✅   |

**交付时与计划的五处偏差**（B2 的「仅改 import」没能字面成立，记在这里备查）：

1. `contracts/local-adapter.spec.ts` / `contracts/remote-adapter.spec.ts` 直接 `new` 引擎类，
   随实现一起搬进插件包 —— 核心包不能 devDepend 插件包（Nx 项目图会出环）。
2. 搬过去的 `Repository.querycache.spec.ts` / `Repository.remote-invalidation.spec.ts` 手搭的
   `rxdb` 替身要补一个 `getQueryCacheEngine` 成员（填真工厂，不是桩），断言与用例数逐条未变。
3. `entity/querycache-production-path.spec.ts` 整份搬走；`entity/entity-manager.querycache.spec.ts`
   按「断言看得见谁」切成两半 —— 分桶 / 混批拒绝 / 树实体 fail-fast 留核心，四条要一路走到
   `QueryCacheEngine.create()` 的搬进插件包。计划里「留核心 + 假引擎桩」对这批用例不成立：
   桩会把被测对象挖空。
4. 引擎不在 `Repository` 构造期取，改成首次订阅 `primary$` 时惰性取并记忆。构造期取会让
   `new RxDB()` 当场炸 —— `VersionManager` 在构造里就建系统树实体 `RxDBBranch` 的仓储，
   而 `lifecycle: 'scoped'` 插件要到 `connect()` 才安装。`connect()` 的 B3 护栏仍是提前、
   点名实体的那一道。
5. 破坏性变更的下游波及面比计划估得大：`QueryCacheRepository` 离开 `@aiao/rxdb` 加上 B3 的
   fail-fast 护栏，逼得三个适配器包（`rxdb-adapter-supabase` / `rxdb-adapter-http` /
   `rxdb-adapter-sqlite-wasm`）与 `dev-rxdb-http` 演示应用都要装插件才能跑通。其中
   `rxdb-adapter-supabase` 的 `querycache-error-contract.spec.ts` 是全量测试才暴的 ——
   适配器包的 `typecheck` 只跑 `tsc --build tsconfig.lib.json --emitDeclarationOnly`，
   spec 文件不在其内，构造函数改签名这类破坏在 `typecheck` 上一声不响。

**测试数**：`rxdb` 140 文件 / 2,585 条，`rxdb-plugin-querycache` 12 文件 / 193 条，
合计 2,778 ≥ 搬迁前 `rxdb` 的 2,764（B2 判据）。

### 阶段 C

| #   | 前置条件                           | 操作                       | 预期结果                                                                                                                                                                    | 状态 |
| --- | ---------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| C1  | 插件 X 声明 `inject: ['plugin:y']` | `init()`                   | Y 进入 `active` 后 X 才安装；Y 缺席时 X 停在等待态并 warn，`connect()` 不挂起                                                                                               | ✅   |
| C2  | 未装 history 插件                  | `connect()`                | `versionManager` 槽位不存在、历史 / 分支 API 不可达；本地 CRUD 与「触发器 → `handle_rxdb_change` → `QueryManager`」增量链路照常（原判据「两张系统表不建」已证伪，见偏差 2） | ✅   |
| C3  | 装 history 插件                    | 写入后 `undo()` / `redo()` | 行为与外移前一致（复用 US-301 / US-302 / US-307 测试）                                                                                                                      | ✅   |
| C4  | 装 history 插件                    | 建分支、切分支、合并分支   | 行为与外移前一致（复用 US-305 / US-308 测试）                                                                                                                               | ✅   |
| C5  | 未装 history 插件                  | 访问 `rxdb.versionManager` | 运行期读到 `undefined` 而非半截对象；类型上该槽位由插件 `declare module` 合并而来——注意 TS 的模块增强是**程序级**的，编译单元里任何一处导入插件，整个程序都看得见它         | ✅   |
| C6  | 三框架 demo                        | 撤销重做 UI 操作           | Angular / React / Vue 三端 API 与行为对称                                                                                                                                   | ✅   |

**交付时与计划的十二处偏差**（C2 的判据开工当天就被证伪，连锁改动记在这里备查）：

1. **整个 `version/` 都搬走了，不只「历史 / 分支半区」。** 推拉与历史共用一个 `VersionManager`
   门面、一条 changelog 水位、一套分支解析；照计划切一半，得先在两半之间造一层跨包接缝，
   而那层接缝阶段 D 一开工就要拆掉。于是阶段 C 把 `version/` 整棵迁进
   `@aiao/rxdb-plugin-history`，**阶段 D 改为从插件包里切出** `@aiao/rxdb-plugin-sync`，
   不再从核心切。判定表的「推拉同步 / 冲突解决」一行与「实现文件」表的 D 行都已按此改写。

2. **AC C2 的原判据不成立，已就地改写。** 原文「`RxDBBranch` / `RxDBChange` 表不建」错在把表
   当成了历史子系统的东西：changelog 触发器**无条件**写 `branchId`（`rxdb-adapter-sqlite-core`
   的 `table/trigger_sql.ts`），`RxDBChange.branch` 这条 `MANY_TO_ONE` 生成真实的
   `REFERENCES rxdb$rxdb_branch(id)` 外键（`table/create_table_sql.ts`）——没有分支表就建不出
   变更表，没有变更表，「触发器 → `handle_rxdb_change` → `QueryManager`」这条响应式增量链路整条断。
   按本故事自己的规则「搬走的是消费者，不是原语」，三张系统表与它们的解析留核心。

3. **核心因此新增 [`system/system-repositories.ts`](../../../packages/rxdb/src/system/system-repositories.ts)。**
   「当前分支」原来由 `VersionManager` 解析，它要走；解析本身却是原语——QueryCache 出站与
   同步链路每条远端事件都在用。四个导出（`getLocalSystemRepositories` /
   `getRemoteSystemRepositories` / `getCurrentBranch` / `resolve_current_branch`）留核心，
   热冷两条路径（热路径不开事务、冷路径在事务内双重检查）连同理由注释一并保留。

4. **核心新增 `sync-contract/`。** `conflict.ts`（LWW 解决器）、`VersionManager.interface.ts`、
   `VersionManager.utils.ts`、`pushable-repository-rules.ts`、`sync-record-utils.ts`、
   `sync-type-utils.ts`、`cascade-contract.ts`、`compact-changes.ts` 从 `version/` 提出来留核心：
   冲突模型、变更编解码、「哪些仓储可推」的判定都是适配器与 QueryCache 出站在读的原语，
   跟着插件走会让六个适配器包反向依赖历史插件——正是「必须留在核心」一节要避免的那件事。

5. **`SyncStateHub` 留核心，改由插件回填。** 「连带成本」已预告三框架的 `useSyncState` 绑
   `rxdb.syncState`，Hub 因此走不了；但喂它数字的 `HistoryManager.pushableCount$` 随插件走。
   解法是给 Hub 加两条由插件在 `install(scope)` 里接上、作用域释放时退订的接缝：
   `bindPushableCount(source$)` 与 `requestPullableRefresh()` / `bindPullableRefresh(fn)`。
   直传字段 `SyncStateSources.pushableCount` 随之删除，波及 5 处 querycache fixture 与
   三框架 `use-sync-state` 规格各一份。

6. **核心公开面 452 → 460（+20 / −12），不是净减。** 12 条随插件走（`VersionManager`、
   `cleanupExpired`、`syncBranches`、`RxDBCrossScopeTransactionError`、`DependencyGraph` 等）；
   20 条是第 3 / 4 两项把原先藏在 `version/` 里的原语显式化的结果，另有一批是
   `sync-listeners.ts` 随插件出境逼出来的——它仍在调 `countQueryCacheOutbox` /
   `flushQueryCacheOutbox`，而出站按判定表留在核心等阶段 D，于是出站模块的对外面
   （两个函数 + `QueryCacheOutboxResult` / `QueryCacheOutboxFailure`）必须转公开。
   这是「为什么 QueryCache 必须切成两半」里那条双向环的最后一段：环已断，
   但断面现在是包边界，得有名字。按
   [versioning-policy.md](../../versioning-policy.md) 属破坏性变更。插件包公开面 15 条 =
   迁出的 12 条 + `rxDBPluginHistory` / `RxDBPluginHistory` / `RxDBPluginHistoryOptions`。

7. **阶段 A 的 A3 探针换了参照物。** `RxDB.gateway-scope.spec.ts` 原先用
   `versionManager.destroy()` 排在网关**之前**来证明网关已从点名代码挪进作用域；核心不再构造
   `VersionManager` 之后，参照物换成一个 `lifecycle: 'scoped'` 的插件探针——它走的正是
   `versionManager` 现在走的那条路（插件作用域），判据逐字等价，不是放宽。

8. **搬过去的规格要改 rxdb 替身，不止改 import**（与阶段 B 的偏差 2 同因）：`getCurrentBranch`
   现在经 `rxdb.localAdapter$` 取系统仓库，手搭替身得把这条流补上，填真仓库而不是桩。
   下游残留的 `versionManager` 桩则相反——两份 sqlite-core 规格里的已成摆设，删掉，
   其中一条断言改挂 SQL 证据。

9. **DevTools 的解耦比预估深一层。** `DevToolsRxDB.versionManager` 从 `Pick<RxDB, …>` 里摘出来，
   改成可选成员 + 手写的 `DevToolsVersionManager` 接口（三个分支操作一律 `Promise<unknown>`，
   由 `__tests__/rxdb-contract.spec.ts` 防漂移），connector 的 `#runBranchOp` 随之多一条
   「宿主没装插件」的错误臂；`requirements/api-baseline/rxdb-devtools.json` 新增
   `DevToolsVersionManager`。连带一处**反向**结论：扩展 e2e 的 fixture 里那个会炸的
   `versionManager` getter **不能删**——成员可选之后摘掉它，connector 就走「宿主没装插件」
   那条常态路（只打一行 `console.error` 咽下去），闸门漏命令这件事从「当场炸」退化成
   「悄悄没反应」，AC#41 的判据也就没了。理由已写死在
   `apps/rxdb-devtools-extension-e2e/fixture/index.html` 的文件头。

10. **sqlite 家族的测试拓扑整体上移一层。** `AdapterFactory` 与 `@aiao/rxdb-test` 的
    `EncryptedAdapterFactory` 现在**契约上**要求调用方先 `use(rxDBPluginHistory)`——六个
    `AdapterFactory` 实现（electron ×2 / sqlite-wasm / sqlite-official / sqliteai / wa-sqlite）
    与 pglite、tauri 两个加密工厂照办；
    `rxdb-adapter-sqlite-core` 把插件声明为可选 peerDependency + 类型专用 `import type {}`；
    pglite 的 42 份规格自行注册插件，`execute_switch_actions.ts` 改走核心 `getCurrentBranch`，
    `execute_switch_actions.unit.spec.ts` 与 querycache fixture 从 `VersionManager` 改挂
    `localAdapter$` 上的系统仓库；6 份 supabase 同步规格与 `review-regressions.spec.ts` 的桩里
    换成真 `SyncStateHub`。

11. **一条 conformance-only 依赖走 `ignoredDependencies` 而非 `dependencies`。**
    `rxdb-adapter-tauri` 的加密契约套件读 `adapter.rxdb.versionManager`，工厂得先 `use()` 历史插件；
    但 `conformance/` 不在该包的 `files` 里（只发 `dist` + `src`），装本包的用户永远拿不到这条
    import。放进 `dependencies` 会让每个装 tauri 适配器的人被迫拖一份历史插件，而适配器自己
    一行都没用到它。与 sqlite-core 的可选 peerDependency 是**不同**的答案，因为 sqlite-core 的
    `./testing` 子路径确实随包发布。

12. **13 份 demo setup 文件加 `.use(rxDBPluginHistory)`，`modules/angular-todo` 走类型专用 import +
    peerDependency。** `use()` 必须排在 `connect()` 之前——`connect()` 内部会调 `init()`，
    而 `getAdapter()` 不会。类型侧则相反地便宜：TS 的模块增强是**程序级**的，编译单元里任何一处
    `import type {} from '@aiao/rxdb-plugin-history'` 就够整个程序看见 `rxdb.versionManager`，
    只消费类型的模块因此能「拿增强、不拿运行期依赖」。

**另补两件**（不是偏差，是搬完才看见的洞）：`packages/rxdb-plugin-history/README.md`——它是唯一
没有 README 的插件包，顺手修掉 `index.ts` 里一处 `@example` 调的
`rxdb.versionManager.undo()`（撤销重做在 `history()` 交出的作用域 API 上，TSDoc 例子不过类型检查，
搬家时跟着抄错了）；以及
[`__tests__/system/system-repositories.spec.ts`](../../../packages/rxdb/src/__tests__/system/system-repositories.spec.ts)
——偏差 3 新增的核心模块只被插件与适配器套件间接跑到，核心侧覆盖率 36.36% / 16.66%，
补 8 条后四项全 100%，`rxdb` 总覆盖回到 94.04 / 91.36 / 95.03 / 94.89。

**测试数**：`rxdb` 98 文件 / 1,952 条，`rxdb-plugin-history` 47 文件 / 683 条，
合计 2,635 ≥ 搬迁前 `rxdb` 的 2,585（C3 / C4 判据）。

### 阶段 D

| #   | 前置条件                                        | 操作                            | 预期结果                                                                                                                                  | 状态 |
| --- | ----------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| D1  | 装 sync 插件（其 `inject` 含 `plugin:history`） | `push()` / `pull()` / `sync()`  | 行为与外移前一致（复用现有 push/pull 契约测试）                                                                                           | ✅   |
| D2  | 未装 sync 插件、只配 local                      | `connect()`                     | `reachability` 不往 `globalThis` 挂监听（改 `watch()` 引用计数，无订阅者时零监听）；`RxDBSync` 表照建（原判据「表不建」已证伪，见偏差 3） | ✅   |
| D3  | 核心 `Repository`                               | 构造 QueryCache 主仓储          | 核心不再值导入 `pendingQueryCacheWriteIds`——待提交写的查询改由插件注入                                                                    | ✅   |
| D4  | 装 sync 插件                                    | 断网后恢复                      | 退避重放与 `syncState` 面板数字与外移前一致                                                                                               | ✅   |
| D5  | 装 sync + querycache 插件                       | QueryCache 实体离线写、恢复联网 | `flushQueryCacheOutbox` 由 sync 插件驱动，水位线仍是 `RxDBSync.lastPushedChangeId`，与 push 共用                                          | ✅   |
| D6  | 装 sync、未装 querycache，无 QueryCache 实体    | `connect()`                     | 正常运行——两包间连类型边都没有（`QueryCacheRemoteAdapter` 由核心导出，各自从 `@aiao/rxdb` 取），不产生 `inject` 运行期依赖                | ✅   |

**交付时与计划的十二处偏差**（D2 的判据与阶段 C 的 C2 同样在开工当天被证伪，记在这里备查）：

1. **`@aiao/rxdb-plugin-sync` 声明 `inject: ['plugin:history']`，而 `init()` 不是它的结算点。**
   这是整个阶段代价最大的一条，两份 HTTP 适配器固件先后栽在同一个坑上：`inject` 会把安装推迟到
   提供方就绪之后，而 `rxdb.init()` 是同步的，返回时那一趟还没落地。固件写的是
   `rxdb.init(); await http.connect();`——后者是**适配器自己**的方法，不走
   `#await_plugin_installs()`，于是出站队列这一槽永远是空的，读引擎第一次对账才炸，
   栈还落在 `combineLatest` 里的 `map` 上，看不出跟插件有关。唯一的公开结算点是
   `await rxdb.connect(<adapterName>)`——它对**已连接**的适配器同样有效，
   [`RxDB.ts`](../../../packages/rxdb/src/RxDB.ts) 的已连接分支会重跑一次
   `#await_plugin_installs()`。两份固件各补一句 `await rxdb.connect('sqlite')`，
   理由写死在调用点旁边。

2. **可达性与 `SyncStateHub` 留核心，只搬消费者。** 判定表原写「`network/` + `sync-state.ts`
   随阶段 D 一起走」，实到两者都没动：`rxdb.reachability` 有**适配器级**消费者——
   [`RxDBAdapterSupabase.ts`](../../../packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts)
   在五处用它判传输失败，核心 [`Repository.ts`](../../../packages/rxdb/src/repository/Repository.ts)
   也在传它；`SyncStateHub` 则在阶段 C 偏差 5 就已定案留核心（三框架 `useSyncState` 绑
   `rxdb.syncState`）。搬走任一个，六个适配器包或三个框架绑定包就得反向依赖同步插件。
   按本故事自己的规则「搬走的是消费者，不是原语」，走的是 `push*` / `pull*` / `sync*` 与出站，
   留的是可达性监视器与汇聚面。「实现文件」表的 D 行已按此改写。

3. **AC D2 的 `RxDBSync` 半边不成立，已就地改写。** 「未装 sync 插件则 `RxDBSync` 表不建」
   要求建表时机能看见插件状态，而三件事都指向反面：`SchemaManager.init()` 在
   [`SchemaManager.ts`](../../../packages/rxdb/src/schema/SchemaManager.ts) 里一次性 push
   `SYSTEM_ENTITIES`（四张表含 `RxDBSync`），`localAdapter.createTables()` 又排在
   `#await_plugin_installs()` 之前；`RxDBBranch.syncs` 是一条真 `ONE_TO_MANY`
   （`mappedEntity: 'RxDBSync'`），拆掉它分支表的关系面就缺一块；核心
   [`sync-record-utils.ts`](../../../packages/rxdb/src/sync-contract/sync-record-utils.ts)
   还在做 `adapter.getRepository(RxDBSync)`——`sync-contract/` 是阶段 C 偏差 4 特意留核心的原语。
   与 C2 同样的结论：表是原语，留核心。判据改写成只管可达性那一半。

4. **可达性那一半是真做的，不是放宽：`ReachabilityMonitor` 多了 `watch()`，宿主监听改按引用计数。**
   原先构造即往 `globalThis` 挂 `online` / `offline`，只要 `new RxDB()` 就挂上了，
   D2 无从谈起。现在监听器由 `watch()` 开、由它交出的 `release()` 关，计数归零即摘干净；
   同步插件在 `install(scope)` 里走 `scope.acquire(() => this.rxdb.reachability.watch(), …)`，
   作用域一释放监听跟着没。[`reachability.spec.ts`](../../../packages/rxdb/src/__tests__/network/reachability.spec.ts)
   净增 12 条断言（`expect(add).not.toHaveBeenCalled()` / `listeners.size` 归零、重入、
   重复 `release()` 不抛），**零删除**。

5. **`pendingWriteIds` 没有安全兜底，于是 QueryCache 实体要装三个插件。** D3 把
   `pendingQueryCacheWriteIds` 从核心 `Repository` 的值导入改成插件注入的
   `QueryCacheOutboxProvider` 槽位，而这一槽**不能**缺席退化成空集——空集的含义是
   「没有任何 id 被离线写占着」，对账会把每条离线写当孤儿删掉。核心因此在 `connect()` 直接抛
   `RxDBMissingPluginError`。连锁结果：声明 `SyncType.QueryCache` 的实体现在需要
   `@aiao/rxdb-plugin-querycache`（读引擎）**和** `@aiao/rxdb-plugin-sync`（出站队列），
   又因为后者 `inject` 历史插件，实到是**三个**。三份下游套件按此补齐
   （sqlite-wasm 的 `querycache-identity`、HTTP 的 `integration` 与 `wire-integration`）。

6. **`RxDBMissingPluginError` 加了可选的 `subject`。** 原消息硬编码「no engine is installed」，
   缺读引擎和缺出站队列会报出一模一样的一句话——而这两者现在分属两个包，装错哪个都读不出来。
   构造函数末位加 `subject: string = 'engine'`，嵌进 `no ${subject} is installed`；
   出站侧传 `outbox queue`。默认值保证既有调用点一字不改。

7. **`buildOfflineWriteRepositoryRules` 升进核心公开面。** 它原是出站模块的内部函数，
   出站走了之后核心 `Repository` 仍要它拼「哪些仓储算离线写」的规则——与阶段 C 偏差 4
   把 `pushable-repository-rules.ts` 留核心是同一件事的下半段。

8. **核心公开面 460 → 457（−5 / +2），阶段 C 偏差 6 的那笔账在这里平掉。** 走的五条正是
   阶段 C 为「出站还留在核心、而 `sync-listeners.ts` 已出境」被迫转公开的那批：
   `countQueryCacheOutbox` / `flushQueryCacheOutbox` / `QueryCacheOutboxResult` /
   `QueryCacheOutboxFailure` / `pendingQueryCacheWriteIds`——出站和它的调用方现在同包，
   包边界上不再需要它们的名字。新增两条是 `QueryCacheOutboxProvider`（第 5 项的槽位类型）
   与 `buildOfflineWriteRepositoryRules`（第 7 项）。按
   [versioning-policy.md](../../versioning-policy.md) 属破坏性变更。

9. **历史插件公开面 15 → 9（−10 / +4），新包 20 条。** 迁出的十条是
   `bulkSync` 族（`BulkSyncOptions` / `BulkSyncResult`）、`CheckRepositoryUpdatesResult`、
   `cleanupExpired` 族（函数 + `CleanupExpiredOptions` / `CleanupExpiredResult`）、
   `DependencyGraph`、`RepositorySyncStatus`、`syncBranches` 族（函数 + `SyncBranchesResult`）。
   历史侧新增四条是切缝本身：`SyncHistoryBridge`（同步插件回调历史的接口）、
   `PushInFlightRegistry` / `PushInFlightSession`（推送在途登记，历史要读它避免把在途版本当成可撤销）、
   `isIgnorableDetachedVersionEventError`（连同它的 6 条规格一并留在历史侧）。
   新包 20 条 = 迁出的 10 条 + 出站的 5 条（第 8 项）+ `rxDBPluginSync` / `RxDBPluginSync` /
   `RxDBPluginSyncOptions` + `SyncManager` + `GetAllRepositorySyncStatusFilter`。

10. **`GetAllRepositorySyncStatusFilter` 是搬家逼出来的新名字。** `getAllRepositorySyncStatus`
    的过滤参数原先是内联的匿名对象类型——同包内谁都能写出来，跨包就成了不可名状的东西。
    提成具名导出，这是包边界把「省下一个名字」的账单送上门的典型。

11. **`rxdb.versionManager.<syncMethod>` → `rxdb.syncManager.<syncMethod>`，下游 104 处调用点。**
    门面按包切开：撤销重做 / 分支 / 两个计数流留 `versionManager`，推拉留 `syncManager`。
    六份 supabase 同步规格 95 处、`dev-rxdb-supabase` 的 todo 页与
    [`rxdb-adapter-supabase/README.md`](../../../packages/rxdb-adapter-supabase/README.md) 9 处。
    连带一处**替身**要跟着切成两半：`todo.page.spec.ts` 的 rxdb 桩现在
    `syncManager: { pull, push }` 与 `versionManager: { history, pullableCount$, pushableCount$ }`
    分列——页面读错哪一边都当场红，这正是它该有的判别力。
    `[VersionManager] … failed:` 这行 console 前缀随之改成 `[SyncManager]`。

12. **`@aiao/rxdb-plugin-sync` 必须进 `tsconfig.base.json` 的 `paths`。** demo 应用没有
    自己的 `package.json`，模块解析全靠工作区根的路径映射；漏了这一条，
    `dev-rxdb-http` / `dev-rxdb-supabase` 的 `typecheck` 会报 TS2307，而
    `lint` / `test` 全绿——两个门禁看不见同一个洞。

**另补两件**（不是偏差，是搬完才看见的洞）：`rxdb-adapter-tauri` 的
`ignoredDependencies: ['@aiao/rxdb-test', '@aiao/rxdb-plugin-history']`（阶段 C 偏差 11）
与 DevTools 扩展 e2e 固件里那个会炸的 `versionManager` getter（阶段 C 偏差 9）**都不用动**——
逐条核过，两处读的都只是历史侧 API（`versionManager.history()` / `createBranch` /
`switchBranch` / `mergeBranch` / `removeBranch`），一条都没落在同步半区；
以及 querycache 套件里的 `systemRepositoryStub` 与 `querycache-production-path.spec.ts` 的
`createSystemRepository` 一并删除——出站改由插件注入之后，这两个桩已无人问津。

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
| E1  | 装 tree 插件                 | `@TreeEntity` 增删改查 | 行为与外移前一致（复用 US-010 测试）                                             | ⬜   |
| E2  | 未装 tree 插件               | 声明 `@TreeEntity`     | 注册阶段抛错点名缺失插件                                                         | ⬜   |
| E3  | 各适配器的 `*TreeRepository` | 经插件注册路径装配     | 六个适配器均不需为此改公开 API                                                   | ⬜   |
| E4  | 未装 tree 插件               | `connect()` 并建系统表 | `RxDBBranch` 建表成功——它已不是树实体；`EntityMetadataFeatures.tree?` 已随插件走 | ⬜   |

## 前置与阻塞

### `plugin:*` 依赖解析（阶段 C / D 的前置，已具备）

sync 插件必须排在 history 插件之后——两者共用 changelog 水位。这条「插件依赖插件」的能力由
[US-015](./US-015-plugin-inject-dependency.md) 阶段 B 提供，阶段 C / D 正是它的消费方。

可用的形状：`inject: ['plugin:history']` 让 sync 插件等到 history 插件**装好**（不只是注册）
才开始安装；释放走逆拓扑序，sync 先于 history 撤销；同层内仍是 `use()` 的逆序。依赖成环与名字
歧义在 `use()` 同步抛 `RxDBPluginDependencyCycleError` / `RxDBPluginAmbiguousDependencyError`，
不进半装状态。用法见[插件作者文档](../../../website/docs/plugins/authoring.md)，
契约见 US-015 的 INV-1～7 与 D3 / D4。

### `RxDBBranch` 是树实体（阶段 E 的硬前置）

阶段 E 卡住的不是任何一个外移阶段，而是核心的系统表自己在用树能力——
[`RxDBBranch`](../../../packages/rxdb/src/system/branch.ts) 挂的是 `@TreeEntity` 而不是 `@Entity`：

```ts
import { TreeEntity } from '../entity/tree-entity.decorator.js';
```

树实体一旦成插件，不装 tree 插件连分支表都建不起来；而分支属于阶段 C 的 history 插件，
于是 history 反过来要 `inject: ['plugin:tree']`——为搬走 474 行新增一条跨插件边。
因此阶段 E 的真前置是**先把 `RxDBBranch` 去树化**（或让它随 history 插件走并自带树能力），
这是一段独立工作，不在本故事的任一阶段里。树实体在核心的入边共 4 条
（`entity-manager.ts`、`entity.interface.ts`、`index.ts`、`system/branch.ts`），
其中只有 `system/branch.ts` 这条是阻塞性的，其余三条随插件注册路径即可解开。
「价值待证」的标注不撤。

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

- **changelog 原语**：写入是适配器责任而非上层责任——`IRxDBAdapter.transaction()`
  的 `localChanges` / `disableTriggers` 形参、`getRxDBChangeSequence()`、以及 sqlite-core 的
  `WATCH_TABLES` 都已把 `RxDBChange` 写进适配器契约。本故事搬的是**消费者**（历史、撤销、分支、
  推拉、冲突解决、QueryCache 出站），原语与表结构留在 `@aiao/rxdb` + 适配器。这条边界不划清，
  阶段 C 会演变成六个适配器的同步改造。
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
- 三框架绑定今天**不直接**引用 `versionManager`（`rxdb-angular` / `rxdb-react` / `rxdb-vue`
  的源码里零命中），这是好消息——`useSyncState` 绑的 `rxdb.syncState` 阶段 D 实到**没动**：
  Hub 留核心、插件只回填数字，三份 `use-sync-state` 规格一字未改（见阶段 D 偏差 2）；
- `rxdb-devtools` 的 `connector.ts` 与 `rxdb/database-provider.ts` 直接读 `versionManager`，
  阶段 C 已改且代价比预估大（见阶段 C 偏差 9）；阶段 D **无需再动**——逐条核过，
  DevTools 读的三个分支操作全在历史半区；
- demo 应用（`dev-rxdb-angular` / `dev-rxdb-supabase` / `dev-rxdb-electron` 的 branch-manager
  与 todo 页）直接调 `versionManager`，是改造的实际验收面（阶段 C 实到 13 份 setup 文件，
  见阶段 C 偏差 12；阶段 D 另有 `todo.page` 的推拉调用改挂 `syncManager`，见阶段 D 偏差 11）。

**Epic 归属存疑**：挂在 `epic-004-future-features` 下是权宜——该 Epic 的愿景是「全文搜索、
桌面原生文件存储等中长期能力」，而本故事是核心包重构，不是用户可见能力。真要承诺交付，
按 [epic-007 的自述理由](../../epics/epic-007-public-api-gates.md#为什么单列一个-epic)，
它更应当另开一个「核心瘦身」Epic。

## 实现文件

| 阶段 | 新增包                             | 迁出自 / 就地改动                                                                                                                                                                        |
| ---- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A    | 无                                 | 就地：`entity/entity-options.interface.ts`、`rxdb-adapter.ts`（注册表模板）、`RxDB.ts`（网关作用域化）                                                                                   |
| B    | `packages/rxdb-plugin-querycache/` | `packages/rxdb-plugin-querycache/src/QueryCacheEngine.ts` `query-cache-primary.ts` `query-cache-sync-memo.ts`                                                                            |
| C    | `packages/rxdb-plugin-history/`    | `packages/rxdb/src/version/`（**整棵**，含推拉半区，见阶段 C 偏差 1）；核心留下 `system/system-repositories.ts` 与 `sync-contract/`                                                      |
| D    | `packages/rxdb-plugin-sync/`       | `packages/rxdb-plugin-history/src/`（`push*.ts` `pull*.ts` `sync*.ts`）+ `packages/rxdb/src/repository/query-cache-outbox.ts`；`network/` 与 `sync-state.ts` **留核心**（阶段 D 偏差 2） |
| E    | `packages/rxdb-plugin-tree/`       | `packages/rxdb/src/entity/tree-entity*.ts` + `repository/TreeRepository.ts` + tree 工具                                                                                                  |

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

---

> 写作规范（证据锚点 / 结论复验 / 大故事分阶段 / 价值待证）、命名与状态约定见
> [CONVENTIONS.md](../../CONVENTIONS.md)。
