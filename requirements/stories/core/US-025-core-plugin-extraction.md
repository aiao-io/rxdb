---
id: US-025
title: 核心包子系统按插件边界外移
status: Backlog
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

行数为 `packages/rxdb/src` 下非测试代码，核心包合计 36,986 行。

| 子系统                        | 位置                                                      | 行数  | 判定                 |
| ----------------------------- | --------------------------------------------------------- | ----- | -------------------- |
| QueryCache 远端权威缓存       | `repository/QueryCacheRepository.ts` + `query-cache-*.ts` | 2,532 | **拆**（阶段 A）     |
| 跨 tab 网关                   | `gateway/`                                                | 416   | **拆**（阶段 A）     |
| 历史 / 撤销重做 / 分支        | `version/HistoryManager.ts` 等                            | 3,525 | **拆**（阶段 B）     |
| 推拉同步 / 冲突解决           | `version/push*.ts` `pull*.ts` `sync*.ts` `conflict.ts`    | 6,014 | **拆**（阶段 C）     |
| 可达性 + 同步状态             | `network/reachability.ts` `sync-state.ts`                 | ~500  | 随阶段 C 一起走      |
| 树实体                        | `entity/tree-entity*.ts` `repository/TreeRepository.ts`   | 1,510 | 阶段 D，**价值待证** |
| 迁移执行器                    | `system/migration*.ts`                                    | 378   | 不拆，见下           |
| 元数据校验                    | `entity/metadata-validate.ts`                             | 534   | 不拆，**价值待证**   |
| 事务 / 实体 / Schema / 活查询 | `transaction/` `entity/` `schema/` `query/`               | 剩余  | **核心，不拆**       |

不拆的理由：

- **迁移执行器**：378 行，且 `migrations` 已在 `LIVE_BEHAVIOUR_CONFIG_KEYS` 里；拆出去要
  新增一个包、一条依赖边与一份文档，去掉不到 1% 的包体。抽象数 > 病灶数。
- **元数据校验**：`validateEntityMetadata` 是公开导出，接入方与生成器都在调；改成插件等于
  把一条编译期护栏变成「装了才有」。除非先能证明它在生产构建里确实占体积，否则不动。
- **`system/change-codec.ts` 与 changelog 原语**：`IRxDBAdapter` 已经把它写进契约
  （`getRxDBChangeSequence()`、`transaction()` 的 `localChanges` / `disableTriggers` 形参），
  sqlite-core 的 `WATCH_TABLES` 也直接列了 `rxdb$rxdb_change`。**搬走的是消费者，不是原语**。

## 范围边界

### In Scope

- 把上表判定为「拆」的子系统外移为独立包，经 `IRxDBPlugin` + `install(scope)` 安装
- 补齐 `plugin:*` 跨插件依赖解析（阶段 B / C 的前置，见「前置与阻塞」）
- 系统表随插件注册：`RxDBBranch` / `RxDBChange` / `RxDBSync` 不再由 `SchemaManager.init()` 无条件注入
- 三框架绑定与 DevTools 随之调整，保持 Angular / React / Vue API 对称
- 每阶段更新 `requirements/api-baseline/` 基线与迁移文档

### Out of Scope

- 改变任一子系统的**行为语义**——这是搬家，不是重写；行为变更另开故事
- 适配器侧的 changelog 原语与 `*TreeRepository` 子类（留在适配器包内）
- `packages/rxdb` 拆子路径导出（subpath）——本故事走独立包，不走 `exports` 分叉
- 事务、实体、Schema、活查询合并引擎

## 交付阶段

| 阶段 | 内容                         | 前置                | 状态 |
| ---- | ---------------------------- | ------------------- | ---- |
| A    | QueryCache 与跨 tab 网关外移 | 无                  | ⬜   |
| B    | 历史 / 撤销重做 / 分支外移   | `plugin:*` 依赖解析 | ⬜   |
| C    | 推拉同步 / 冲突 / 可达性外移 | 阶段 B              | ⬜   |
| D    | 树实体外移                   | 阶段 A              | ⬜   |

阶段 A 两项各自独立、互不依赖，是先做它们的理由：

- **QueryCache** 在 [`Repository`](../../../packages/rxdb/src/repository/Repository.ts) 构造里只有
  **一个**分支点 `if (this.sync?.type === SyncType.QueryCache)`，切面天然收敛；
- **网关**已经有 `multiInstance` 这条现成的开关语义，改成「装插件 = 开启」即可，
  并顺带删掉一个配置项。

## 验收标准

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

### 阶段 A

| #   | 前置条件                             | 操作                                        | 预期结果                                                                  | 状态 |
| --- | ------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------- | ---- |
| A1  | 应用只配 `SyncType.None` + local     | 构建产物并核对依赖图                        | `QueryCacheRepository` 与 `gateway/` 均不在图内                           | ⬜   |
| A2  | 装 `rxdb-plugin-querycache`          | 实体声明 `SyncType.QueryCache`、`connect()` | 读写行为与外移前逐条一致（复用现有 US-020~024 测试，仅改 import）         | ⬜   |
| A3  | 未装 querycache 插件                 | 实体声明 `SyncType.QueryCache`、`connect()` | 在 `connect()` 阶段抛出点名缺失插件的错误，不静默降级为本地读             | ⬜   |
| A4  | 装 `rxdb-plugin-tabs`，两个 tab 打开 | 一侧写入                                    | 另一侧收到跨 tab 事件，`firstConnectedAt` 语义不变                        | ⬜   |
| A5  | 未装 tabs 插件                       | `connect()`                                 | 单 realm 正常运行；`RxDBOptions.multiInstance` 已从公开契约移除           | ⬜   |
| A6  | 阶段 A 完成                          | `disconnectAll()`                           | 两个插件的作用域条目全部逆序释放，`RxDB.#shutdown()` 不再逐个手工销毁它们 | ⬜   |

### 阶段 B

| #   | 前置条件                           | 操作                       | 预期结果                                                                      | 状态 |
| --- | ---------------------------------- | -------------------------- | ----------------------------------------------------------------------------- | ---- |
| B1  | 插件 X 声明 `inject: ['plugin:y']` | `init()`                   | Y 进入 `active` 后 X 才安装；Y 缺席时 X 停在等待态并 warn，`connect()` 不挂起 | ⬜   |
| B2  | 未装 history 插件                  | `connect()`                | `RxDBBranch` / `RxDBChange` 表不建，本地 CRUD 正常                            | ⬜   |
| B3  | 装 history 插件                    | 写入后 `undo()` / `redo()` | 行为与外移前一致（复用 US-301 / US-302 / US-307 测试）                        | ⬜   |
| B4  | 装 history 插件                    | 建分支、切分支、合并分支   | 行为与外移前一致（复用 US-305 / US-308 测试）                                 | ⬜   |
| B5  | 未装 history 插件                  | 访问 `rxdb.versionManager` | 编译期即不可达；运行期读到 `undefined` 而非半截对象                           | ⬜   |
| B6  | 三框架 demo                        | 撤销重做 UI 操作           | Angular / React / Vue 三端 API 与行为对称                                     | ⬜   |

### 阶段 C

| #   | 前置条件                                        | 操作                           | 预期结果                                                         | 状态 |
| --- | ----------------------------------------------- | ------------------------------ | ---------------------------------------------------------------- | ---- |
| C1  | 装 sync 插件（其 `inject` 含 `plugin:history`） | `push()` / `pull()` / `sync()` | 行为与外移前一致（复用现有 push/pull 契约测试）                  | ⬜   |
| C2  | 未装 sync 插件、只配 local                      | `connect()`                    | `RxDBSync` 表不建；`reachability` 不往 `globalThis` 挂监听       | ⬜   |
| C3  | 装 sync 插件                                    | 断网后恢复                     | 退避重放与 `syncState` 面板数字与外移前一致                      | ⬜   |
| C4  | DevTools 连上应用                               | 打开同步 / 历史面板            | 插件缺席时面板明确显示「未安装」，不报错也不显示空数据冒充已安装 | ⬜   |

### 阶段 D

| #   | 前置条件                     | 操作                   | 预期结果                             | 状态 |
| --- | ---------------------------- | ---------------------- | ------------------------------------ | ---- |
| D1  | 装 tree 插件                 | `@TreeEntity` 增删改查 | 行为与外移前一致（复用 US-010 测试） | ⬜   |
| D2  | 未装 tree 插件               | 声明 `@TreeEntity`     | 注册阶段抛错点名缺失插件             | ⬜   |
| D3  | 各适配器的 `*TreeRepository` | 经插件注册路径装配     | 六个适配器均不需为此改公开 API       | ⬜   |

## 前置与阻塞

**`plugin:*` 依赖解析今天不可用**，这是阶段 B / C 的硬前置。
[`PluginDependencyScheduler`](../../../packages/rxdb/src/plugin/dependency-scheduler.ts) 的文档写明：

> 阶段 A 只解析 `adapter:*`。`plugin:*` 依赖在宿主侧恒为未就绪

现存四个插件包无一声明过跨插件依赖（`rxdb-plugin-search` 的 `readonly inject = ['adapter:local'] as const`
是唯一的 `inject` 用例）。而 sync 插件必须排在 history 插件之后——两者共用 changelog 水位。
这条能力属于 [US-015](./US-015-plugin-inject-dependency.md) 的阶段 B，需先解锁。

## 技术笔记

**机制已经就绪的部分**（不需要新原语，照抄现有插件的做法即可）：

- **插件可注册实体**：`LIVE_BEHAVIOUR_CONFIG_KEYS` 是 `new Set(['entities', 'migrations'])`，
  `freezeConfig()` 整棵跳过这两项，所以插件能在 `install(scope)` 里往 `rxdb.config.entities` 推类并登记撤销。
  `RxDBPluginStorage.install()` 的 `'storage:entity'` 条目就是现成先例。
- **插件可注册仓储实现**：`RxDB.repository(name, config, scope)` 第三个形参接作用域。
  `EntityManager` 今天注册 `TreeRepository` 走的正是这个 API，阶段 D 只是把调用方从
  `EntityManager` 换成插件。
- **安装时序**：`RxDB.init()` 里 `#install_plugin()` 排在 `schemaManager.init()` **之前**，
  所以插件推进去的实体赶得上建表。

**必须留在原地的部分**：changelog 写入是适配器责任而非上层责任——`IRxDBAdapter.transaction()`
的 `localChanges` / `disableTriggers` 形参、`getRxDBChangeSequence()`、以及 sqlite-core 的
`WATCH_TABLES` 都已把 `RxDBChange` 写进适配器契约。本故事搬的是**消费者**（历史、撤销、分支、
推拉、冲突解决），原语与表结构留在 `@aiao/rxdb` + 适配器。这条边界不划清，阶段 B 会演变成
六个适配器的同步改造。

**连带成本**（排期时不要漏）：

- `requirements/api-baseline/rxdb.json` 单入口 `.` 当前 440 条导出，每个阶段都会动基线，
  且按 [versioning-policy.md](../../versioning-policy.md) 属破坏性变更；
- 三框架绑定今天**不直接**引用 `versionManager`（`rxdb-angular` / `rxdb-react` / `rxdb-vue`
  的源码里零命中），这是好消息——但 `useSyncState` 绑 `rxdb.syncState`，阶段 C 要一并处理；
- `rxdb-devtools` 的 `connector.ts` 与 `rxdb/database-provider.ts` 直接读 `versionManager`，
  阶段 B / C 必须同步改；
- demo 应用（`dev-rxdb-angular` / `dev-rxdb-supabase` / `dev-rxdb-electron` 的 branch-manager
  与 todo 页）直接调 `versionManager`，是改造的实际验收面。

**Epic 归属存疑**：挂在 `epic-004-future-features` 下是权宜——该 Epic 的愿景是「全文搜索、
桌面原生文件存储等中长期能力」，而本故事是核心包重构，不是用户可见能力。真要承诺交付，
按 [epic-007 的自述理由](../../epics/epic-007-public-api-gates.md#为什么单列一个-epic)，
它更应当另开一个「核心瘦身」Epic。

## 实现文件

| 阶段 | 新增包                             | 迁出自                                                                      |
| ---- | ---------------------------------- | --------------------------------------------------------------------------- |
| A    | `packages/rxdb-plugin-querycache/` | `packages/rxdb/src/repository/QueryCache*.ts` `query-cache-*.ts`            |
| A    | `packages/rxdb-plugin-tabs/`       | `packages/rxdb/src/gateway/`                                                |
| B    | `packages/rxdb-plugin-history/`    | `packages/rxdb/src/version/`（历史 / 分支半区）                             |
| C    | `packages/rxdb-plugin-sync/`       | `packages/rxdb/src/version/`（推拉半区）+ `network/` + `sync-state.ts`      |
| D    | `packages/rxdb-plugin-tree/`       | `packages/rxdb/src/entity/tree-entity*.ts` + `repository/TreeRepository.ts` |

受影响但不迁移：`packages/rxdb/src/RxDB.ts`、`packages/rxdb-devtools/`、三框架绑定包、
`packages/rxdb-test/`、`apps/dev-rxdb-*`。

## References

- [US-015 插件 inject 依赖](./US-015-plugin-inject-dependency.md) — `plugin:*` 解析的前置
- [US-014 插件作用域契约](./US-014-plugin-scope-contract.md) — `install(scope)` 拆卸语义
- [US-020 QueryCache 仓储](./US-020-querycache-repository.md) — 阶段 A 的行为基线
- [US-301 版本控制](../collaboration/US-301-version-control.md) / [US-302 撤销重做](../collaboration/US-302-undo-redo.md) — 阶段 B 的行为基线
- [versioning-policy.md](../../versioning-policy.md) — 公开 API 破坏性变更流程

---

> 写作规范（证据锚点 / 结论复验 / 大故事分阶段 / 价值待证）、命名与状态约定见
> [CONVENTIONS.md](../../CONVENTIONS.md)。
