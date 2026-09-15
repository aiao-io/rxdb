---
id: US-026
title: 实例级实体同步配置覆盖
status: Backlog
priority: High
epic: epic-004-future-features
created: 2026-09-15
updated: 2026-09-15
tags: [core, sync, model, server, cross-framework]
---

<!--
INVEST 检查清单:
- [x] Independent: 基于现有同步模式与配置解析，不依赖 commit graph 或新的适配器
- [x] Negotiable: 配置字段名、条目容器与内部解析接口在 plan 阶段冻结
- [x] Valuable: 前后端直接复用同一个实体类，环境差异由数据库实例表达
- [x] Estimable: 边界限定为初始化配置解析、调用链一致性与现有 HTTP demo 收敛
- [x] Small: 不包含运行时切换、已有数据迁移、动态实体注册或新的同步协议
- [x] Testable: 优先级、整体替换、实例隔离、非法配置与三框架行为均有独立 AC
-->

# 用户故事：实例级实体同步配置覆盖

## 作为/我想要/以便

**作为** 在浏览器和 Node.js 服务端共享领域模型的应用开发者
**我想要** 在创建 RxDB 实例时，为指定实体配置该实例使用的同步策略
**以便** 同一个实体类在浏览器使用远端权威与本地行缓存，在服务端使用纯本地数据库，而无需复制实体类或修改共享装饰器元数据

## 现状与证据

1. [`getSyncConfig()`](../../../packages/rxdb/src/version/sync-type-utils.ts) 当前按实体声明优先解析：

   ```ts
   return metadata.sync || globalSync;
   ```

   实体上已有 `sync` 时，实例的数据库默认配置无法覆盖它。复验方式是读取该函数，以及
   [`RxDBOptions`](../../../packages/rxdb/src/rxdb.interface.ts) 的 `sync` 配置入口。

2. [`Recipe` 与 `ServerRecipe`](../../../modules/recipes-domain/src/recipe-entity.ts) 共享
   `RECIPE_SCHEMA`，但仍声明两套相同业务字段。前者声明 `SyncType.QueryCache`，使用
   `wa-sqlite` 与 `http`；后者声明 `SyncType.None`，仅使用 `pglite`。复验方式是对照两个类的
   `@Entity()` 参数与字段声明。这个重复是本故事要消除的具体接入成本。

3. [US-216 的单实体类收敛边界](../adapter/US-216-server-side-rxdb.md#范围边界) 明确将实例级
   sync 覆盖留给独立 core 故事。本故事承接该能力缺口，不转移 US-216 已验收的 AC，
   不改变其 `Done` 状态。

## 目标行为

以下是同一个实体类的两种部署配置，不是新增公开 API 的签名：

| 使用位置       | 实体声明                                             | 实例覆盖                     | 生效结果                                        |
| -------------- | ---------------------------------------------------- | ---------------------------- | ----------------------------------------------- |
| 浏览器         | `QueryCache`，local 为 `wa-sqlite`，remote 为 `http` | 未提供                       | 保持现有缓存、离线写回与远端失效通知行为        |
| Node.js 服务端 | 同一个 `Recipe` 类                                   | `None`，仅 local 为 `pglite` | 本地 CRUD；无需 HTTP adapter 或 QueryCache 插件 |

## 配置语义

### 选择与优先级

- 新增可选的实例配置入口，按已注册的业务实体类引用选择覆盖目标。条目容器与字段名在 plan 阶段冻结。
- 生效配置的优先级为：**该实例对该实体的显式覆盖 > 实体装饰器的 `sync` > 数据库默认 `sync`**。
- 覆盖条目提供完整的 `SyncOptions`，选中后整体替换低优先级配置，不逐字段或递归合并。
  例如用 `None + local: pglite` 覆盖 `QueryCache + local: wa-sqlite + remote: http` 后，生效配置中没有 remote。
- 未提供条目的实体继续走现有解析规则；显式 `null`、缺少 `type` 等非法值不得解释为“未提供”。
- 类名或实体名相同不代表同一个目标；不同 namespace 的同名实体必须能分别配置。
  不支持通配符、基类覆盖向子类传播、未注册实体、内部系统实体或自动生成的关系中间实体作为覆盖目标。
- 同一实体出现重复条目时初始化失败，不使用最后一条覆盖前一条。

### 实例隔离与配置生命周期

- 覆盖只属于创建它的 RxDB 实例。实体装饰器元数据、其他实例与生成器读取的模型描述均不被修改。
- 覆盖配置在初始化时形成实例自己的稳定配置；调用方随后修改原始条目或嵌套选项不能改变运行中的路由。
  这不要求冻结调用方的实体类、函数对象或其他外部对象。
- 元数据校验、适配器选择、Repository 查询、EntityManager 单条与批量写、事务路由、同步调度及同步状态
  都使用同一份生效配置，不能分别回读实体原始 `sync` 得出不同结果。
- 校验针对生效配置执行。未被选择的实体原始 remote 不得成为纯本地覆盖的依赖；选中 QueryCache 时，
  已有适配器能力校验与缺插件错误仍须成立。覆盖不自动创建 adapter 或安装插件。
- 首版配置只在创建实例时指定，运行中不支持改变策略；关闭后重连同一实例仍使用相同配置。
- 同 realm 多实例验收通过显式的 `rxdb.getRepository(Entity)` 等实例入口执行。
  无实例归属的实体静态方法继续遵守现有歧义处理契约，本故事不增加隐式“当前数据库”。

## 范围边界

### In Scope

- 实例级实体同步覆盖的配置类型、解析、校验与配置生命周期。
- 查询、写入、关系、事务及同步消费者对生效配置的统一使用；现有不支持组合仍明确拒绝。
- 使用同一个实体类的前后端 HTTP demo：前端保留现有策略，后端显式覆盖为纯本地 PGlite。
- Angular、React、Vue 使用同一 core 配置语义；既有绑定入口透传并验证，不新增框架专属策略。
- 公开类型、TSDoc、配置文档、API baseline、兼容性测试及相关示例同步更新。

### Out of Scope

- 运行中热切换策略、动态实体注册，以及在不同策略或物理数据库之间迁移已有行、历史、水位线和待发送写入。
- HTTP Full-sync、新的同步模式、adapter 或传输协议。
- 每请求身份与租户上下文、权限模型、服务端水平扩展。
- 跨策略关系的自动适配；不改变关系中间实体的既有同步规则。
- 实体装饰器 API、生成器输出默认语义或现有未配置覆盖的应用行为变更。
- US-025 的剩余插件拆分、epic-006 的工作树与提交历史。

## 验收标准

|   # | 前置条件                                                                                                          | 操作                                                                | 预期结果                                                                                                                   | 状态 |
| --: | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | :--: |
|   1 | 实体声明 QueryCache，数据库默认策略与之不同，实例显式覆盖为 `None + local: pglite`                                | 初始化并对该实体查询、创建、更新、删除                              | 使用 PGlite；不要求原声明中的 HTTP adapter 或 QueryCache 插件；不产生远端请求                                              |  ⬜  |
|   2 | 实例未提供覆盖或覆盖列表为空；夹具包含实体有声明与无声明两种情况                                                  | 执行既有配置、查询与写入用例                                        | 解析结果、返回值和错误行为与变更前相同；保留现有 `SyncType.None` 与数据库默认配置的判定规则                                |  ⬜  |
|   3 | 实体原声明包含 remote、QueryCache 缓存选项；覆盖仅有合法的纯本地配置                                              | 检查解析结果并运行 CRUD                                             | 低优先级的 remote、adapter 名和缓存选项均不残留；没有深合并形成的混合配置                                                  |  ⬜  |
|   4 | 两个不同数据库实例在同一 realm 注册同一个实体类，分别覆盖为本地与 QueryCache；后者配置独立的 local、remote 与插件 | 交替初始化、通过各自 Repository 读写；销毁其中一个后继续操作另一个  | 数据和网络请求只进入各自实例；剩余实例继续使用自己的策略；共享实体原始元数据不变                                           |  ⬜  |
|   5 | 某实例已初始化，调用方仍持有传入的覆盖条目与嵌套 local/remote 选项                                                | 修改调用方对象，再查询及关闭重连；读取原实体字段描述                | 运行中与重连后的策略稳定；原实体模型描述不受覆盖影响；不冻结调用方的实体类                                                 |  ⬜  |
|   6 | 注册两个 namespace 不同、name 相同的实体，另有未覆盖实体                                                          | 分别配置不同覆盖并读写                                              | 覆盖精确命中目标；其他实体和生成的关系中间实体继续按既有配置规则工作                                                       |  ⬜  |
|   7 | 分别构造未注册目标、系统实体目标、重复条目、`null` 配置和缺少 `type` 的配置                                       | 初始化                                                              | 在建立实体绑定与执行数据库写入前失败；错误可判别并指出目标及原因，不静默忽略条目或选取其中一条                             |  ⬜  |
|   8 | 实体原声明为本地，覆盖为 QueryCache；分别缺 remote、缺插件或选择不支持该模式的 adapter                            | 初始化或调用既有能力校验入口                                        | 按生效配置触发现有对应的 fail-fast 错误；不沿用原声明绕过校验，也不自动创建依赖                                            |  ⬜  |
|   9 | 同一覆盖实体具备单条、批量与事务写入夹具                                                                          | 经 Repository、实体保存入口、EntityManager 批量入口及事务执行器操作 | 所有入口选择同一生效策略；既有批量与事务边界不放宽；失败按既有原子性契约回滚                                               |  ⬜  |
|  10 | 覆盖为 QueryCache，已配置可用 adapter 与插件                                                                      | 离线写入、恢复连接、接收远端变更通知并观察同步状态                  | 现有出站重放、缓存刷新和状态统计均针对生效策略工作；覆盖为纯本地的实体不进入该管道                                         |  ⬜  |
|  11 | 使用现有 Full、Filter 与关系夹具；另含 Tree/Graph 与 QueryCache 不支持组合                                        | 对合法覆盖执行同步与关系操作，对非法组合初始化                      | 已支持组合通过共享契约；非法组合按生效策略被拒绝，不因只检查装饰器原值而漏检                                               |  ⬜  |
|  12 | Angular、React、Vue 分别使用同一个带同步声明的实体及相同 core 覆盖配置                                            | 通过各框架现有查询与写入入口运行共享夹具                            | 三端路由、数据与错误语义一致；类型支持一致，不引入单端配置语义                                                             |  ⬜  |
|  13 | HTTP demo 的前后端使用共享领域模块                                                                                | 收敛为同一个 `Recipe` 类，后端通过实例覆盖运行                      | 删除仅为同步策略存在的第二个实体类及重复字段；前后端继续实际复用领域查询；后端保持纯本地                                   |  ⬜  |
|  14 | demo 完成单类收敛                                                                                                 | 运行 HTTP server 端点契约、HTTP 浏览器 e2e 及独立 wire 集成套件     | 现有协议、CORS、分页与 SSE 断言保持通过；不得修改协议断言来迁就新配置                                                      |  ⬜  |
|  15 | 新增公开配置已实现                                                                                                | 校验类型兼容、TSDoc、API baseline、文档与覆盖率                     | 旧配置调用继续编译；公开 API 仅增量扩展；核心与三框架包覆盖率达 90%，其他受影响包达 80%；相关 lint/typecheck/test 门禁全绿 |  ⬜  |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

- 先为 AC#1～4 建立失败用例，再修改配置解析；随后补齐每条读写与同步消费者的回归。
- 实现前扫描 `getSyncConfig`、`getSyncType`、`metadata.sync` 及主适配器选择入口。
  不能只修改 Repository：[`EntityManager.init()` 与批量写入口](../../../packages/rxdb/src/entity/entity-manager.ts)
  也消费数据库默认配置和实体元数据。
- plan 阶段冻结配置字段名、实体条目容器、实例生效配置的归属与诊断错误形状。
  配置优先级、整体替换、无覆盖兼容与实例隔离属于本故事固定约束。
- [US-025](./US-025-core-plugin-extraction.md) 正在移动同步消费者；本故事沿用实现时的插件边界，
  不将配置规则复制到各插件，也不以 US-025 阶段 C～E 完成为能力前置。
- 本故事新增配置能力，不引入数据库 schema 或 change-codec 迁移，不依赖 epic-006 的桥接发布。

## 实现文件

以下为实现落点，不表示本需求提交已经修改产品代码；新增文件名由 plan 冻结。

| 路径                                                                                          | 职责                                        |
| --------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `packages/rxdb/src/rxdb.interface.ts`、`packages/rxdb/src/RxDB.ts`                            | 可选实例配置与配置生命周期                  |
| `packages/rxdb/src/version/`、`packages/rxdb/src/entity/`、`packages/rxdb/src/repository/`    | 生效配置解析、校验与全部读写/同步消费者接入 |
| `packages/rxdb-plugin-querycache/`                                                            | QueryCache 插件按实例生效配置消费依赖       |
| `packages/rxdb-angular/`、`packages/rxdb-react/`、`packages/rxdb-vue/`、`packages/rxdb-test/` | 三框架配置类型与共享行为夹具                |
| `modules/recipes-domain/`、`apps/dev-rxdb-http/`、`apps/dev-rxdb-http-server/`                | 单实体类与前后端配置收敛                    |
| `packages/rxdb-adapter-http/`、`apps/dev-rxdb-http-e2e/`                                      | 协议与真实浏览器回归                        |
| `requirements/api-baseline/`、`website/docs/`                                                 | 增量 API 基线与接入文档                     |

## References

- [US-216 参考后端以 RxDB 引擎实现](../adapter/US-216-server-side-rxdb.md) — 单类收敛的使用场景
- [US-020 将 QueryCache 接入统一 Repository](./US-020-querycache-repository.md) — 读写路由边界
- [US-021 QueryCache 远端适配器缺席时配置期 fail-fast](./US-021-querycache-adapter-fail-fast.md) — 生效策略的配置校验
- [US-023 QueryCache 远端失效上报与实时同步](./US-023-querycache-remote-invalidation.md) — 失效通知行为回归
- [US-025 核心包子系统按插件边界外移](./US-025-core-plugin-extraction.md) — 消费者归属与配置接缝
- [US-213 HTTP wire 集成测试](../adapter/US-213-http-wire-integration-test.md)、[US-214 HTTP 浏览器 demo](../adapter/US-214-http-browser-demo.md) — 协议兼容性证据
