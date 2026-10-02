---
id: US-027
title: 实体操作权限模型
status: In Review
priority: Low
epic: epic-004-future-features
created: 2026-09-20
updated: 2026-10-02
tags: [core, permission, model, rxdb-model]
---

# 用户故事：实体操作权限模型

## 作为/我想要/以便

**作为** 模型开发者
**我想要** 在实体定义上逐个操作（创建 / 更新 / 删除）声明它是否对用户开放
**以便** 用户经公开写入口误写系统维护的实体（14 张系统表，或业务里只由同步 / 迁移写入的实体）时当场抛错并指名实体与操作，rxdb-model 的 Angular / React / Vue 绑定按同一份声明隐藏入口、呈现只读，而不是靠逐字段 readonly 与 `isSystemEntity()` 特判维系

定位是公开写入口上的**快速失败**，不是防御边界：适配器 / 执行器层的写不判定（见范围边界）。
这与受信写门禁的定位一致，`trusted-write-scope.ts` 自述「这道门禁不是防御边界，是一致性契约」。

## 背景与动机

1. **系统表进了 demo 的实体目录。** `SchemaManager.init()` 把 `rxdb.systemEntities` 并进
   `config.entities`：核心 4 张（`CORE_SYSTEM_ENTITIES`）加 working-tree 插件经 `createSystemContribution()` 贡献的 10 张，
   都在 `rxdb` 命名空间。三个 demo 的实体目录都从 `config.entities` 构建，于是目录里多出一个 `rxdb` 分组、14 张表。
   rxdb-model 现成的只读守卫都认行上的 `_readonly`：单元格编辑器与行删除在 `column-utils.ts`（`isReadonly()` 分支、
   `disabledEditorForReadonly`、`switchDisabledForReadonly`），
   拖拽在 `table-operations.ts`（`patchDragIconForReadonlyRows()`、`collectReorderedIds()`），
   粘贴与 Delete 键清空单元格在 `table-clipboard.ts`（`applyClipboard()`、`applySystemText()`、`collectDeleteWrites()`），
   空格 / 回车切换在 `table-keyboard.ts`（`toggleCellValue()`）。三框架 `EntityList` 用 `deriveEntityCapabilities()`
   决定 `isCreateBlocked` 与 `_readonly`，操作列的「删除」由 `actionsColumn()` 的删除谓词决定（阶段 C）；
   14 张系统表三操作都声明 `'system'`（阶段 A），因此整表只读、没有「删除」，三端 `openViewDialog` 对只读行以 view 模式
   打开详情（阶段 0）。

   `isSystemEntity()` 的消费方都拿它做**排除**，没有一条写路径拿它拒绝：
   `RxDB` 构造期的 `snapshotSyncOverrides()`、`backup/schema-fingerprint.ts`、`sync-listeners.ts`、
   working-tree 的 `capture-hook.ts`、`RxDBAdapterHttp` 的 `#isSubscribed`（全仓 grep `isSystemEntity(` 后逐条读调用点）。
   经公开写入口新建 `RxDBBranch` 行、删 `RxDBChange` 行、改写撤销标记，由 `permissions` 判定当场拒绝（阶段 B）；
   适配器 / 执行器层的同类写不判定（范围边界）。

2. **字段级 `readonly` 只管「更新时不改写」。** `normalizeUpdateEntity()` 在更新侧静默剔除 readonly 键，
   sqlite-core / pglite 的 `update_sql.ts`、`SupabaseRepository` 与两份 `switch-result.utils.ts` 都走它；插入不过滤。
   它不拒绝、不报错，拦不住新建与删除；`property-types.interface.ts` 的 TSDoc 与这个行为一致。
   系统表靠逐字段标记维持只读（`RxDBChange` 标了 10 个字段），漏标新字段即裸奔。

3. **系统写全在适配器 / 执行器层，公开写入口上没有系统写。** 逐个读调用点后按实现分两类：

   | 实现                      | 调用点                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | 写到的表       |
   | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
   | 适配器 / 执行器的仓储 API | sync 推送回写（`commitRepositoryPush()` 的 `executor.saveMany()` 与 `executor.getRepository(RxDBSync).update()`）、拉取后的本机 `remoteId` 回填（`backfillOwnChangeRemoteIds()`）、`getOrCreateSyncRecord()`、`remove_branch()` 的 `executor.removeMany()`、`create_branch()` 事务内的 `branchRepository.create()`、`runMigrationsOnce()` 的迁移登记、working-tree 的提交落盘（`write-commit.ts`）、分支贡献行（`branch-commit-rows.ts`）与物化阶段推进、search 插件经 `tx.getRepository(RxDBMigration)` 的登记 | 只有系统表     |
   | 原始 SQL                  | 各实体表的 AFTER 触发器写 `RxDBChange`；undo/redo 经 `adapter.switchBranch()` → `convertSwitchResultToSql()`；拉取应用经 `mergeChanges()`；分支激活的 `UPDATE … RETURNING`；working-tree 的 HEAD CAS、检出物化与合并                                                                                                                                                                                                                                                                                            | 业务表与系统表 |

   受信调用点登记表的 11 个调用点（history 6 / sync 3 / working-tree 2）全部守在第二类的 `switchBranch()` / `mergeChanges()` 上。
   迁移脚本自己的 `up(executor)` 写什么由迁移作者决定，同样在执行器层。

   反过来，公开写入口上没有系统写：`packages/` 的非测试源码里调用 `EntityManager` 写方法的只有三框架 `EntityList`
   （批量保存 `entityManager.mutations(...)` 与行删除的实体实例 `remove()`），是用户写；同一次 grep 命中的
   `push-repository.ts`、`commit-graph-guard.ts`、`branch-materialization.ts`、`capture-runtime.ts` 都是
   `executor.getRepository(X).update()`，属执行器层。门面仓储（`RxDB.getRepository()` / `EntityManager.getRepository()`）
   在 `packages/` 非测试源码里的用法全是读——`HistoryManager`、`undo-redo-apply.ts`、`query-cache-outbox.ts`、
   `relation-helper.ts`、devtools、`entity-detail.ts`、无限滚动列表（全仓 grep 后逐条读调用点）。
   `apps/` 与 `modules/` 的 demo 经门面写的调用点有 33 个文件，写的全是业务实体（Todo、Menu、File、Article、Comment、
   Recipe），没有一处写系统表（grep 门面写方法后逐条看实体类型）。所以把 `RxDBChange` 声明成用户不可写，
   碰不到 undo/redo、同步与删分支。

4. **公开写入口收敛到 4 个方法。** 读 `Repository.ts` 与 `entity-manager.ts` 核对：
   - 门面 `Repository` 的 `create()` / `update()` / `remove()` 经 `primary$` 交给主适配器的仓储，本地、remote-only 与
     QueryCache 都在这之后才选端；
   - `EntityManager.create()` / `update()` / `remove()` 经 `#get_entity_repository()` 委托给门面；实体实例的 `save()` /
     `remove()` 经 `PROTOTYPE_METHODS` 进 `EntityManager`；实体静态方法按 `staticMethods` 名单代理到门面，
     核心名单（`Repository._STATIC_METHODS`）全是读；
   - `EntityManager.save()` 单条走上面三个方法；多条——含 `getNeedSaveEntities()` 带出的关联实体与
     `getNeedRemoveEntities()` 带出的待删中间表行——与 `saveMany()` / `removeMany()` 都走 `mutations()`；
   - `EntityManager.mutations()` 直达 `adapter.mutations()`；QueryCache 批次例外，`#mutations_query_cache()` 逐条调
     `create` / `update` / `remove`，其 TSDoc 写明「本批不是原子的」。

   所以判定点只要 4 处：门面 3 个写方法加 `mutations()`。`mutations()` 必须在分派前整批预检——QueryCache 批次在第 N 条
   才拒绝，前 N−1 条已经写出去了。

   公开 API 之外能直接写库的对象都属于适配器 / 执行器层：`rxdb.getAdapter()`、`localAdapter$` / `remoteAdapter$`
   拿到的适配器及其 `mutations()` / `saveMany()` / `removeMany()` / `transaction()` 执行器 / `rawQuery()`；
   适配器轴的 `IRxDBAdapter.getRepository()`（其 TSDoc：与门面仓储 `RxDB.getRepository()`「不是同一个对象」）。
   投影改写——`rxdb.switchBranch()`、undo/redo、合并、拉取——也在这一层。门面的 `rawQuery()` 是 `protected`，
   非测试源码没有子类调用它。门面子类里额外的写方法只有图插件 `GraphRepository` 的 `addEdge()` / `removeEdge()`
   （也挂成实体静态方法），直接交给本地适配器的图仓储，写 `graph_edge_entity.ts` 生成的 `<Name>_edges` 边实体。

5. **受信写通道守的是捕获层一致性，不是执行者身份。** `packages/rxdb/src/trusted-write/`：fail-closed、
   作用域对象 + WeakMap、取用即清除。每个作用域只存一条声明，挂在适配器实例上时并发调用会互相顶掉
   （`trusted-write-concurrency.spec.ts` 的文件头）——拿这种作用域给写归类执行者，并发的用户写会被算成系统写，
   反之亦然。本故事因此不复用它：执行者按层区分（见「权限声明」），不需要系统写作用域、actor 归类或
   `WRITE_ENTRANCES` 映射，系统调用点零改动。

6. **「创建后谁都改不了」在判定点上立不住。** 业务实体默认记变更日志：`log` 缺省即开启，sqlite-core 与 pglite 的
   `create_tables_sql.ts` 只对 `log !== false` 的实体建触发器，`switch_branch.ts` 只对它们回放。于是一行即使对公开写入口不可变：
   撤销建它的那笔事务会删掉它（`convertSwitchResultToSql()` 生成 DELETE）；切分支会删掉或重插它；拉取经 `mergeChanges()`
   覆盖它；外键级联绕过它（`get_default_cascade_options()`：一对一、一对多默认 `CASCADE`，可空多对一默认 `SET_NULL`）。
   这些全在适配器层。真不可变要在 SQL 层用 `BEFORE UPDATE / DELETE` 触发器 `RAISE(ABORT)`，并单独处理日志、分支、
   同步与撤销（**推断**：至少要求 `log: false`），另立故事。同理，「只许用户、不许系统」在按层模型下没有可判定的含义。
   所以枚举只有 `'both'` 与 `'system'`。

7. vision 阶段 4「模型驱动应用」已规划「字段级权限、只读规则、条件显示和统一校验」，本故事是其中「实体级操作权限」的增量切片。

## 权限声明

每个实体可对三个操作各声明一个值：

```ts
/**
 * 实体操作对谁开放
 * - both：公开写入口与适配器 / 执行器层都能写（默认，即现状）
 * - system：只留给适配器 / 执行器层的系统写，公开写入口抛 PermissionDeniedError
 */
type EntityOperationPermission = 'both' | 'system';

interface EntityPermissionOptions {
  create?: EntityOperationPermission; // 缺省按操作就近继承，都没声明为 'both'
  update?: EntityOperationPermission;
  delete?: EntityOperationPermission;
}

@Entity({
  name: 'ExchangeRate',
  permissions: {
    create: 'system', // 只由同步拉取写入：UI 无「+ 新增」，公开写入口的 create 被拒
    update: 'system', // 用户只读：行挂 _readonly，「查看」以 view 模式打开
    delete: 'system' // 用户不能删：操作列没有「删除」
  }
})
```

执行者按层定义，不靠作用域自报：

- **用户** = 经公开写入口的写：门面 `Repository` 的 `create()` / `update()` / `remove()` 与 `EntityManager.mutations()`，
  以及委托到它们的 `EntityManager` 方法与实体实例方法（背景第 4 条）。UI 操作、应用代码、插件代码只要走这些入口都算用户。
- **系统** = 适配器 / 执行器层的写（背景第 3 条）。这一层不判定：`'system'` 的意思是「公开写入口不开放」，
  不是给系统写发放行证。

| 业务诉求     | 配置                        | 效果                                                                           |
| ------------ | --------------------------- | ------------------------------------------------------------------------------ |
| 用户可增删改 | 不配置（三操作都 `'both'`） | 与现状一致                                                                     |
| 用户不能新建 | `create: 'system'`          | 公开写入口的 create 抛 `PermissionDeniedError`；UI 隐藏「+ 新增」              |
| 用户只读     | `update: 'system'`          | 公开写入口的 update 被拒；行挂 `_readonly`，单元格不可写，「查看」为 view 模式 |
| 用户不能删   | `delete: 'system'`          | 公开写入口的 remove 被拒；操作列不显示「删除」，「查看」保留                   |
| 系统表       | 三操作都 `'system'`         | 14 张系统表都显式这样声明（阶段 A）                                            |

## 交付阶段

| 阶段 | 交付                                                                                                                                                      | 直接前置  | AC 区段           | 状态 |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ----------------- | ---- |
| 0    | 只读行查看：操作列对只读行保留「查看」、只藏「删除」；三端 `openViewDialog` 对只读行走 view 模式；三端系统表 e2e                                          | 无        | AC#13、16         | ✅   |
| A    | 声明与元数据：`permissions` 类型与 TSDoc、按操作就近继承、metadata-validate 校验（枚举值与未知键）、14 张系统表显式声明、`RxDB.init()` 断言系统表声明完整 | 无        | AC#1～5           | ✅   |
| B    | 公开写入口判定：门面 `Repository` 的 3 个写方法与 `EntityManager.mutations()` 整批预检；`PermissionDeniedError`                                           | 阶段 A    | AC#6～9           | ✅   |
| C    | 三框架 UI 派生：能力派生、`_readonly` 与删除能力拆开、关系 Tab；三端 e2e                                                                                  | 阶段 0、A | AC#10～12、14、15 | ✅   |

AC#1（未配置 `permissions` 的实体零变化）每个阶段都守住；阶段 0 关掉的 AC#13 / AC#16 由阶段 C 守住。

阶段 0 不依赖任何权限抽象：`actionsColumn()` 对只读行保留「查看」图标；
三端 `openViewDialog` 按 `record['_readonly']` 选 `formMode`，只读行走 `buildFormFields(meta, 'view')` + `formMode: 'view'`，
三端表单组件在 `'view'` 下不渲染保存按钮（React `entity-form.tsx` 的 `!isReadonly && showActions`，Angular / Vue 同构）。
阶段 C 让 `_readonly` 只由 `canEdit` 派生，「删除」改由 `actionsColumn()` 的删除谓词决定，两者不再绑在一起。

## 范围边界

### In Scope

- 实体级 `create / update / delete` 三操作的 `'both' | 'system'` 声明、按操作就近继承与 metadata-validate 校验
- 14 张系统表（核心 4 张 + working-tree 贡献 10 张）的显式声明；`RxDB.init()` 断言 `systemEntities` 三操作全为 `'system'`
- 公开写入口判定：门面 `Repository` 的 `create()` / `update()` / `remove()` 与 `EntityManager.mutations()`（整批预检）；
  `PermissionDeniedError`
- `permissions` 的 TSDoc：定位（快速失败，不是防御边界）、判定的入口、不判定的路径（Out of Scope 前四条）
- rxdb-model 与 Angular / React / Vue 三个绑定的 UI 能力派生（按钮显隐、单元格 / 表单只读、详情模式、关系 Tab）

### Out of Scope

- 适配器 / 执行器层的写：`rxdb.getAdapter()` / `localAdapter$` / `remoteAdapter$` 拿到的适配器，其 `mutations()` /
  `saveMany()` / `removeMany()` / `transaction()` 执行器 / `rawQuery()`，适配器轴的 `getRepository()`。
  系统写全在这一层（背景第 3 条），判定放进来就得让系统写自报身份（背景第 5 条）
- 投影改写：`rxdb.switchBranch()`、undo/redo、合并、拉取——它们重放的是已经发生过的写
- 外键级联：在 SQL 层执行（`get_default_cascade_options()`）
- 图插件的 `addEdge()` / `removeEdge()`：写自动生成的 `<Name>_edges` 边实体，边实体的权限是否跟随节点实体由图插件另定
- 真不可变（创建后系统也不能改）：要 SQL 触发器，并处理日志、分支、同步与撤销（背景第 6 条），另立故事
- 多用户 / 角色 / 租户权限（→ [US-029](US-029-rbac-tenant-permission-design.md)；vision 阶段 3「用户身份、设备身份、工作区成员和权限模型」）
- 字段级权限模型扩展与条件显示（阶段 4 剩余部分；字段级 readonly 保持现有语义，不在本故事升级为拒绝）
- 远程 / 服务端授权（remote adapter 的服务端侧权限）
- 权限审计日志

## 验收标准

| #   | 前置条件                                                                                               | 操作                                                                                                                                                                                                     | 预期结果                                                                                                                               | 状态 |
| --- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 实体未配置 `permissions`                                                                               | 经全部公开写入口执行 create / update / delete；三框架 UI 打开其列表与详情                                                                                                                                | 全部放行，写入与 UI 行为与现状一致（现有测试不回归）                                                                                   | ✅   |
| 2   | `permissions` 含非法值（如 `'none'`、`'user'`）或未知键（如 `read`）                                   | `RxDB.init()`（`EntityManager.init()` 汇总 metadata-validate 违规后抛错，与现有元数据规则同一时机）                                                                                                      | 初始化时报错，指出实体名、键与非法值                                                                                                   | ✅   |
| 3   | 父类声明 `update: 'system'`；子类甲只声明 `delete: 'system'`，子类乙不声明                             | 读取两个子类的运行期元数据                                                                                                                                                                               | 甲的 update 与 delete 都是 `'system'`、create 为 `'both'`；乙与父类一致                                                                | ✅   |
| 4   | 启用 working-tree 后 `rxdb.systemEntities` 的 14 张表                                                  | 读取各自运行期元数据                                                                                                                                                                                     | 三操作都是 `'system'`                                                                                                                  | ✅   |
| 5   | 插件贡献一张未声明 `permissions`（或任一操作不是 `'system'`）的系统表                                  | 构造 `RxDB` 并 `use()` 该插件                                                                                                                                                                            | 初始化抛错，指出表名与操作                                                                                                             | ✅   |
| 6   | 实体 `create: 'system'`、`update: 'system'`、`delete: 'system'` 各一                                   | 用户经每个单条入口执行对应操作：门面 `Repository.create()` / `update()` / `remove()`、`EntityManager.create()` / `update()` / `remove()` / `save()`、实体实例 `save()` / `remove()`（入口 × 操作参数化） | 抛 `PermissionDeniedError`（`RxDBError` 子类，违规清单恰一项：实体名与操作）；被拒的 create 不留新行，update 后行原样，remove 后行仍在 | ✅   |
| 7   | 一批里有合规写，也有一条违规写（对 `update: 'system'` 实体的更新，或对 `delete: 'system'` 实体的删除） | 分别经 `saveMany()`、`removeMany()`、`mutations()`、带出关联实体的单条 `save()` 提交                                                                                                                     | 整批被拒，库里一条都没变；错误的违规清单列出批内**全部**违规的实体与操作，不止第一条                                                   | ✅   |
| 8   | 同 AC#7，批内实体为 QueryCache 实体，违规写排在合规写之后                                              | 经 `mutations()` 提交                                                                                                                                                                                    | 整批被拒，远端与本地都没有写出前面的合规写                                                                                             | ✅   |
| 9   | 14 张系统表三操作都 `'system'`；另有一个 `update: 'system'` 的业务实体                                 | 跑 sync 推送与拉取、迁移、建 / 删分支、undo/redo、working-tree 提交与物化；再经 `rxdb.getAdapter()` 的 `mutations()` 与 `transaction()` 执行器更新该业务实体                                             | 全部成功，不抛 `PermissionDeniedError`（适配器 / 执行器层不判定）；现有 sync / history / working-tree 测试不回归                       | ✅   |
| 10  | 实体 `create: 'system'` 与未配置实体各一                                                               | 三框架 UI 打开两者的列表                                                                                                                                                                                 | 前者不显示「+ 新增」；后者显示，且创建成功                                                                                             | ✅   |
| 11  | 实体 `update: 'system'`，`delete` 未配置                                                               | 三框架 UI 打开列表                                                                                                                                                                                       | 行挂 `_readonly`：单元格、粘贴、拖拽、键盘切换都不可写；操作列显示「查看」与「删除」，删除成功                                         | ✅   |
| 12  | 实体 `delete: 'system'`，`update` 未配置                                                               | 三框架 UI 打开列表                                                                                                                                                                                       | 行可编辑、可保存；操作列只有「查看」，没有「删除」                                                                                     | ✅   |
| 13  | 行挂 `_readonly`（系统表与 `update: 'system'` 的实体）                                                 | 三框架 UI 点该行的「查看」                                                                                                                                                                               | 详情以 view 模式打开，字段全部只读，没有保存入口                                                                                       | ✅   |
| 14  | 可编辑实体内某字段 `readonly: true`                                                                    | 三框架 UI 编辑该实体                                                                                                                                                                                     | 字段级只读继续生效，实体级权限不覆盖字段级配置                                                                                         | ✅   |
| 15  | 详情的关系 Tab 内嵌列表，被关联实体分别为 `update: 'system'` 与 `delete: 'system'`                     | 三框架 UI 打开关系 Tab                                                                                                                                                                                   | 与 AC#11 / AC#12 同样的派生                                                                                                            | ✅   |
| 16  | 三个 dev app 的 `rxdb` 分组                                                                            | 打开任一系统表的列表与详情                                                                                                                                                                               | 无新增 / 删除入口、不可编辑；「查看」可用且为 view 模式；三端 e2e 覆盖                                                                 | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

各条 AC 的证据（用例名可直接 grep；`rxdb` 指 `packages/rxdb/src/__tests__/entity/`）：

| AC     | 证据                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1      | `rxdb` 的 `entity-permissions-enforcement.spec.ts`「US-027 AC#1 未配置 permissions 的实体零变化」；`rxdb-model` 的 `entity-capabilities.spec.ts`「未声明 permissions：三个能力全开（AC#1）」；三端 `entity-list.real.spec`「未声明 permissions 的实体照常提供新增」；各包既有测试与三端 e2e 不回归                                                                                                                                                                                                           |
| 2      | `rxdb` 的 `entity-permissions.spec.ts`「US-027 AC#2 非法值与未知键」，含「RxDB.init() 汇总后抛错，消息带实体名、键与非法值」                                                                                                                                                                                                                                                                                                                                                                                 |
| 3      | 同文件「US-027 AC#3 按操作就近继承」                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 4      | 同文件「US-027 AC#4 核心系统表声明」；working-tree 的 `system-entity-registration.spec.ts`「10 个类一律 namespace=rxdb、log=false，且表名与 data-model.md §1 一致」断言 `permissions` 等于 `SYSTEM_ENTITY_PERMISSIONS`                                                                                                                                                                                                                                                                                       |
| 5      | 同文件「US-027 AC#5 插件贡献的系统表必须声明完整」，含「经 use() 贡献漏声明的系统表，init() 抛错」                                                                                                                                                                                                                                                                                                                                                                                                           |
| 6      | `rxdb` 的 `entity-permissions-enforcement.spec.ts`「US-027 AC#6 单条入口逐个拒绝」（门面、`EntityManager`、实体实例三类入口按操作参数化）；pglite 的 `entity-permissions.spec.ts`「AC#6 单条入口被拒后库里原样」                                                                                                                                                                                                                                                                                             |
| 7      | 同文件「US-027 AC#7 批量入口整批预检」；pglite 的「AC#7 批量与带出关联实体的单条 save() 整批被拒」                                                                                                                                                                                                                                                                                                                                                                                                           |
| 8      | 同文件「US-027 AC#8 QueryCache 批次在任何写发出之前被拒」                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 9      | pglite 的「AC#9 适配器 / 执行器层不判定」（`adapter.mutations()` 与 `transaction()` 执行器）；14 张系统表声明后 rxdb-plugin-sync / history / working-tree 全量测试不回归                                                                                                                                                                                                                                                                                                                                     |
| 10～12 | 三端 `entity-list.real.spec`「US-027 新增 / 编辑 / 删除入口按实体 permissions 派生」（AC#10～12 各一条，删除与编辑都落库断言）；`column-utils.spec.ts`「readonly rows still show delete when the record can be deleted (update: system, US-027 AC#11)」与「editable rows hide delete …（delete: system, US-027 AC#12）」；三端 e2e「US-027 create / update / delete: system」三条（`AuditLog` / `Invoice` / `Contract`）。AC#11 的粘贴、拖拽、键盘切换走背景第 1 条的现成 `_readonly` 守卫，由其既有用例覆盖 |
| 13、16 | `column-utils.spec.ts`「keeps only the view icon when the record cannot be deleted (delete hidden)」；三端 `entity-list.real.spec`「只读行（系统表）view-action 以 view 模式打开详情：字段只读、无保存入口」与「系统表整表只读：不提供新增，每一行都标 _readonly」；三端 e2e「系统表只读：无新增 / 删除入口，「查看」以 view 模式打开详情」（`RxDBBranch`）                                                                                                                                                  |
| 14     | `build-editable-columns.spec.ts` 与 `form.spec.ts` 的「实体级权限不覆盖字段级只读 …（US-027 AC#14）」                                                                                                                                                                                                                                                                                                                                                                                                        |
| 15     | 三端 `entity-detail.real.spec`「US-027 AC#15 关系 tab 内嵌列表与独立列表同一派生：发票行只读可删，合同行可编辑不可删」                                                                                                                                                                                                                                                                                                                                                                                       |

演示实体在 `@aiao/rxdb-test` 的 `entities/`：`AuditLog`（`create: 'system'`）、`Invoice`（`update: 'system'`）、
`Contract`（`delete: 'system'`），后两者经多对一关联 `Account`，供 AC#15 的关系 Tab 使用；
`published-model-invariants.spec.ts`「declares the US-027 permission demos exactly as the three demo apps rely on」锁住声明。
`ENTITIES` 由客户端生成器按实体名字母序输出，三个 dev app 的 `/entities` 因此重定向到 `public/Account`。

## 技术笔记

**关键设计决策**：

- **执行者按层区分**：判定只设在公开写入口，判定处一律视为用户，不引入系统写作用域与 actor 归类。
  成立的前提是背景第 3 条——系统写全在适配器 / 执行器层；AC#9 守住它。副作用正是想要的：
  将来若有系统代码改走门面写 `'system'` 实体，会当场被拒，系统写只能留在适配器 / 执行器层。
- **判定落点**：门面 `Repository` 的 `create()` / `update()` / `remove()` 在 `primary$` 之前判，与主端选择无关。
  `EntityManager.mutations()` 在 `resolveBatchPrimaryAdapter()` 之前对 `create` / `update` / `remove` 三组整批预检，
  任一违规即整批拒绝、一条不写；QueryCache 批次随后经门面逐条再判一次，结果相同，不必去重。判定只读元数据，是同步纯函数，
  所以整批预检在任何写发出之前完成，与 `#mutations_query_cache()`「本批不是原子的」说的执行期原子性无关，AC#8 不需要改执行层。
  预检读的是 `mutations()` 的入参，即 `getEntityMutations()` 的产出：单条 `save()` 带出的关联实体与待删 Junction 都在里面。
  `getNeedSaveEntities()` 只收 `modified` 的关联实体，未改动的只读关联实体不会被带进批次误拒。
- **多对多 Junction**：`SchemaManager.init()` 以 `@Entity(metadataOptions)` + `extends EntityBase` 生成 Junction 实体，
  不声明 `permissions`，取缺省 `'both'`，与两端实体的声明无关。把业务行关联到 `update: 'system'` 的实体只增删 Junction 行、
  不写那张只读实体，放行。
- **按操作就近继承**：子类没声明的操作沿用最近一个声明了该操作的祖先，都没声明为 `'both'`。
  整键覆盖会让「子类只收紧 delete」悄悄放开父类收紧的 update。`metadata-transition.ts` 的 `nearest_declared()`
  只处理 `repository` / `sync` / `log` 三个整键，`permissions` 由 `mergeEntityPermissions()` 按操作展开。
- **校验**：`validateEntityMetadata()` 是返回违规列表的纯函数，`permissions` 的非法值与未知键进同一份列表
  （未知键的写法同 `invalidFormatConfig` 的 `unknownKeys`）。`'none'` 与 `'user'` 的报错消息说明不支持的原因（背景第 6 条），
  不只报「非法值」。
- **系统表声明**：14 张表各自在 `@Entity` 上显式写 `permissions`，不按 `isSystemEntity()` 补默认值——模块级登记簿只增不减、
  按 `namespace:name` 认表，接入方合法声明的同名实体会被误判成系统表（`RxDB.#ensureEntityTables()` 的 TSDoc）。
  完整性按实例清单 `rxdb.systemEntities` 在 `RxDB.init()` 里断言，时机同先例 `assertNoSystemEntityOverride()`：
  `#install_plugin()` 之后、`schemaManager.init()` 之前。不能放进 `constructor()`——插件经构造后的 `use()` 注册，
  构造期只看得到模块级登记簿，断言恒真。贡献方加表漏声明会在初始化时失败，而不是裸奔（背景第 2 条的问题）。
- **错误形状**：`PermissionDeniedError extends RxDBError`，带只读的违规清单 `violations: readonly PermissionViolation[]`，每项是 `{ namespace, entity, operation }`。
  单条入口清单恰一项；`mutations()` 预检收齐整批违规后一次抛出，`message` 汇总全部条目。`RxDBError` 只有 `message`，
  本仓按错误类型区分失败原因（如 `system/active-branch-guard.ts` 的 `InvalidBranchIdError`），没有错误码体系。
  US-029 阶段 B 的全部拒绝路径沿用这个类型，逐行判定的批量拒绝同样落进这份清单，所以形状在本故事阶段 B 就定成清单。
- **TSDoc 定位**：`permissions` 的 TSDoc 写明判定在哪些入口、不在哪些路径（Out of Scope 前四条），并写明这是快速失败、
  不是防御边界。调用方不能把「没报错」当成「拦住了」。
- **UI 派生**：`deriveEntityCapabilities()`（`@aiao/rxdb-model`）从元数据派生 `{ canCreate, canEdit, canDelete }`。`canCreate=false` 并进三端 `EntityList`
  的 `isCreateBlocked`；`_readonly` 只表示 `canEdit=false`，继续驱动背景第 1 条列出的现成守卫，并决定「查看」的打开模式；
  删除另走 `actionsColumn()` 新增的删除能力参数，类型取按行谓词 `(record) => boolean`——本故事全表同值，
  US-029 按行求值，签名不用再改。`actionsColumn()` 的四个调用方是 `build-editable-columns.ts` 与三端 `EntityList`。
  关系 Tab 内嵌的就是 `EntityList`，同路径派生，详情组件不需要改。
- **与字段级 readonly 的分工**：实体级权限是「门」（公开写入口能不能动这个实体），字段级 readonly 是「栅」
  （可编辑实体内哪些字段更新时不改写）。本故事不改字段级 readonly 的语义。
- **向后兼容**：默认 `'both'` 三元组 = 现状，未配置实体的所有写路径与 UI 行为零变化。

## 立项依据

按[价值待证](../../CONVENTIONS.md#价值待证)判据，阶段 A / B / C 病灶数 < 抽象数：新增抽象 3 个（`permissions` 声明与判定、
`PermissionDeniedError`、UI 能力派生），病灶只有「程序化误写系统表不报错」1 项，是潜在风险而非已报告的症状；
用户踩得到的系统表写入口只有 demo 的实体目录，阶段 0 已修。`priority` 因此为 Low。

owner 决定不等 US-029 立项，三个阶段一次交付。下游 [US-029](US-029-rbac-tenant-permission-design.md)
阶段 A / B / E 依赖的权限类型、判定原语与错误类型、「查看与删除拆开」的 UI 契约随之就绪。

## 实现文件

| 阶段 | 文件                                                                                                                                                       | 说明                                                                                                                                     |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | `packages/rxdb-model/src/entity-table/columns/column-utils.ts`                                                                                             | `actionsColumn()` 对只读行保留「查看」                                                                                                   |
| 0    | `packages/rxdb-model-angular/src/entity-list/`、`packages/rxdb-model-react/src/entity-list/`、`packages/rxdb-model-vue/src/entity-list/`                   | `openViewDialog` 对只读行传 `'view'`，三端同交                                                                                           |
| A    | `packages/rxdb/src/entity/entity-options.interface.ts`、`packages/rxdb/src/entity/metadata.interface.ts`                                                   | `EntityMetadataOptions.permissions` 类型与 TSDoc（定位、判定入口、不判定的路径）；运行期元数据的 `permissions`                           |
| A    | `packages/rxdb/src/entity/entity-permissions.ts`                                                                                                           | `ENTITY_OPERATIONS`、`SYSTEM_ENTITY_PERMISSIONS`、`getEntityPermission()`、`mergeEntityPermissions()`、`assertSystemEntityPermissions()` |
| A    | `packages/rxdb/src/entity/metadata-transition.ts`                                                                                                          | `transitionMetadata()` 经 `mergeEntityPermissions()` 按操作就近继承                                                                      |
| A    | `packages/rxdb/src/entity/metadata-validate.ts`                                                                                                            | `validatePermissions()`：非法值与未知键进 `invalidPermissions` 违规                                                                      |
| A    | `packages/rxdb/src/system/{change,migration,branch,sync}.ts`                                                                                               | 核心 4 张系统表的声明                                                                                                                    |
| A    | `packages/rxdb-plugin-working-tree/src/commit/*.entity.ts`、`packages/rxdb-plugin-working-tree/src/working-tree/*.entity.ts`                               | working-tree 贡献的 10 张系统表的声明                                                                                                    |
| A    | `packages/rxdb/src/RxDB.ts`                                                                                                                                | `init()` 调 `assertSystemEntityPermissions(this.systemEntities)`，与 `assertNoSystemEntityOverride()` 相邻                               |
| B    | `packages/rxdb/src/entity/entity-permissions.ts`                                                                                                           | `PermissionDeniedError`、`PermissionViolation`、`assertEntityOperationAllowed()`、`assertMutationsAllowed()`                             |
| B    | `packages/rxdb/src/repository/Repository.ts`                                                                                                               | 门面 `create()` / `update()` / `remove()` 调 `assertEntityOperationAllowed()`，以 rejected Promise 给出                                  |
| B    | `packages/rxdb/src/entity/entity-manager.ts`                                                                                                               | `mutations()` 分派前调 `assertMutationsAllowed()` 整批预检                                                                               |
| C    | `packages/rxdb-model/src/entity-capabilities.ts`                                                                                                           | `deriveEntityCapabilities()` 与 `EntityCapabilities`                                                                                     |
| C    | `packages/rxdb-model/src/entity-table/columns/column-utils.ts`                                                                                             | `actionsColumn()` 的删除谓词 `(record) => boolean`                                                                                       |
| C    | `packages/rxdb-model/src/entity-table/columns/build-editable-columns.ts`                                                                                   | 删除谓词取 `canDelete`                                                                                                                   |
| C    | `packages/rxdb-model-angular/src/entity-list/`、`packages/rxdb-model-react/src/entity-list/`、`packages/rxdb-model-vue/src/entity-list/`                   | 「+ 新增」显隐、行 `_readonly`、删除谓词改由能力派生，三端同交                                                                           |
| C    | `packages/rxdb-test/entities/{AuditLog,Invoice,Contract,Account}.ts`                                                                                       | 权限演示实体（三个 dev app 的 e2e 与三端关系 Tab 用例共用）                                                                              |
| C    | `apps/dev-rxdb-angular-e2e/src/entity-model.spec.ts`、`apps/dev-rxdb-react-e2e/src/entity-model.spec.ts`、`apps/dev-rxdb-vue-e2e/src/entity-model.spec.ts` | 系统表（AC#16）与三种权限演示实体（AC#10～12）e2e                                                                                        |

## References

- [vision.md](../../vision.md) — 阶段 4「字段级权限、只读规则、条件显示和统一校验」
- [受信写作用域](../../../packages/rxdb/src/trusted-write/trusted-write-scope.ts) — 「不是防御边界，是一致性契约」：本故事判定的同一定位
- [受信写并发用例](../../../packages/rxdb-plugin-history/src/__tests__/trusted-write-concurrency.spec.ts) — 挂在适配器上的作用域在并发下互相顶掉，不适合拿来归类执行者
- [受信调用点登记表](../../../packages/rxdb/src/__tests__/trusted-write/trusted-callsite-registry.spec.ts) — 11 个调用点全部守在 `switchBranch()` / `mergeChanges()` 上
- [实体管理器](../../../packages/rxdb/src/entity/entity-manager.ts) — `mutations()` 与「本批不是原子的」`#mutations_query_cache()`
- [系统表清单](../../../packages/rxdb/src/system/system-entities.ts) — `CORE_SYSTEM_ENTITIES` 与 `isSystemEntity()`
- [US-029 多用户 RBAC 权限与租户隔离](US-029-rbac-tenant-permission-design.md) — 下游：阶段 A / B / E 分别依赖本故事阶段 A / B / C
- [US-028 可排序实体](US-028-sortable-entity.md) — 同改三端 `EntityList` 与 `_readonly` 路径，互不依赖
