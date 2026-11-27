# 实体操作权限

每个实体可以对三个写操作——创建、更新、删除——逐个声明它对谁开放：

- `'both'`：用户与系统都能写（默认，与现状一致）
- `'system'`：只留给系统写，用户经公开写入口写会被当场拒绝并指名实体与操作
- `{ requires: '<权限名>' }`：按这一行所属的作用域判定，调用者在那个作用域上要有这项成员权限，见[按作用域的成员权限](#scoped-member-permissions)

同一份声明同时驱动两件事：写入口的快速失败（抛 `PermissionDeniedError`），以及实体管理界面（Angular / React / Vue 的 `EntityList`）的新增、编辑、删除入口显隐。权限声明在 `@aiao/rxdb` 核心包里，不需要额外安装。

:::warning 这是快速失败，不是防御边界
权限判定只设在公开写入口（门面 `Repository` 与 `EntityManager`）。适配器 / 执行器层的写不判定——同步拉取、迁移、历史回放、工作树物化都走那一层。所以「没报错」不代表「拦住了」；要真正的不可变需要 SQL 触发器兜底，那超出了本模型的语义。
:::

## 它解决什么

在权限模型之前，系统表只能靠逐字段 `readonly` 和 `isSystemEntity()` 特判来维持只读：逐字段标记拦不住新建与删除，漏标一个新字段就裸奔。权限模型把「能不能动这个实体」收敛成实体上的一条声明：

- 15 张系统表（核心 5 张 + working-tree 插件贡献 10 张）显式声明三操作都为 `'system'`，整表对用户只读
- 业务里只由同步 / 迁移写入的实体（如汇率表）可以只收紧 `create`，UI 随之隐藏「+ 新增」
- 三框架 UI 按同一份声明派生入口，而不是各自维护一套特判

与字段级 `readonly` 的分工：实体级权限是「门」（这个实体的操作对用户开不开放），字段级 `readonly` 是「栅」（可编辑实体内哪些字段更新时不改写）。两者互不覆盖——可编辑实体内声明了 `readonly: true` 的字段照旧不被更新改写。

## 声明方式

权限类型来自 `@aiao/rxdb`：

```ts
type EntityOperation = 'create' | 'update' | 'delete';
type EntityOperationPermission = 'both' | 'system' | EntityOperationRule;

interface EntityOperationRule {
  requires: string; // 所需的成员权限名，见「按作用域的成员权限」
}

interface EntityPermissionOptions {
  create?: EntityOperationPermission;
  update?: EntityOperationPermission;
  delete?: EntityOperationPermission;
}
```

在 `@Entity` 装饰器的 `permissions` 键上声明：

```ts
import { Entity, EntityBase } from '@aiao/rxdb';

@Entity({
  name: 'ExchangeRate',
  permissions: {
    create: 'system', // 只由同步拉取写入：UI 无「+ 新增」，公开写入口的 create 被拒
    update: 'system', // 用户只读：行挂 _readonly，「查看」以 view 模式打开
    delete: 'system' // 用户不能删：操作列没有「删除」
  }
})
export class ExchangeRate extends EntityBase {}
```

| 取值       | 含义                                                                  |
| ---------- | --------------------------------------------------------------------- |
| `'both'`   | 用户与系统都能写（默认）                                              |
| `'system'` | 只许系统写：用户经公开写入口写抛 `PermissionDeniedError`，UI 隐藏入口 |

不配置 `permissions` 或某项缺省时，三操作都按 `'both'` 计，写入与 UI 行为与未引入权限模型时完全一致。

`'none'` 与 `'user'` 不受支持：`'none'`（谁都不许写）在门面一层挡不住同步、迁移与适配器直写，声明了只是假象；`'user'`（只许用户、不许系统）在分层模型下没有可判定的含义。声明这两个值会在初始化时报错，报错消息会说明原因，而不是只报「非法值」。

## 就近继承

权限沿原型链**按操作逐键继承**：子类没声明的操作，沿用最近一个声明了该操作的祖先；整条原型链都没声明的操作取 `'both'`。不是整键覆盖——子类只写 `{ delete: 'system' }` 时，父类收紧的 `update` 照样传下来。

例如父类声明 `update: 'system'`：

- 子类甲只声明 `delete: 'system'`：甲的运行期权限为 `create: 'both'`、`update: 'system'`、`delete: 'system'`
- 子类乙不声明：与父类完全一致（`update: 'system'`，其余 `'both'`）

运行期元数据里的 `permissions` 是补齐后的三键齐全对象（`Readonly<Required<EntityPermissionOptions>>`），可以整份读取。

:::tip 多对多中间表不参与继承
多对多关系生成的 Junction 实体由 `SchemaManager.init()` 用默认元数据生成，不声明 `permissions`，取缺省 `'both'`——与两端实体的声明无关。所以把业务行关联到 `update: 'system'` 的实体只增删 Junction 行、不写那张只读实体，照常放行。
:::

## 系统表

系统表是「15 张表各自显式声明」：核心 5 张 + working-tree 插件贡献 10 张，每张都在自己的 `@Entity` 上写着 `permissions: SYSTEM_ENTITY_PERMISSIONS`（即三操作都为 `'system'`）。

核心 5 张（`packages/rxdb/src/system/`、`packages/rxdb/src/grants/`）：

| 实体             | 说明                                           |
| ---------------- | ---------------------------------------------- |
| `RxDBBranch`     | 分支表                                         |
| `RxDBChange`     | 变更日志表                                     |
| `RxDBMigration`  | 迁移登记表                                     |
| `RxDBSync`       | 同步水位表                                     |
| `RxDBGrantState` | 授权快照（单行，见下文「按作用域的成员权限」） |

working-tree 贡献 10 张（`@aiao/rxdb-plugin-working-tree`）：

| 实体                              |
| --------------------------------- |
| `Commit`                          |
| `CommitBranchRef`                 |
| `CommitChangeSet`                 |
| `CommitCapabilityState`           |
| `WorkingTreeState`                |
| `WorkingTreeEntry`                |
| `WorkingTreeActivationState`      |
| `WorkingTreeMaterializationStage` |
| `WorkingTreeMaterializationPage`  |
| `WorkingTreeRestoreSession`       |

`RxDB.init()` 会在插件安装之后、`schemaManager.init()` 之前，按实例清单 `rxdb.systemEntities` 逐表断言三操作都声明为 `'system'`。插件贡献的系统表漏声明（或任一操作不是 `'system'`）会在初始化时抛错，消息点名每张表与它缺的操作。

系统表靠**显式声明**而不是「是系统表就自动收紧」：UI 的隐藏、门面的拦截读的都是同一份声明，自动收紧会让插件作者看不出自己的表受什么约束、漏声明时静默裸奔。声明完整的系统表在实体管理界面里整表只读：无「+ 新增」、无「删除」、每一行都只读，「查看」以 view 模式打开详情。

## 运行时行为

### 判定点

判定只设在公开写入口，共 5 处：

| 入口                                                 | 判定时机                                                                   |
| ---------------------------------------------------- | -------------------------------------------------------------------------- |
| 门面 `Repository.create()` / `update()` / `remove()` | 在 `primary$` 选主端之前——与主端选哪边无关，被拒时连适配器都不碰           |
| `EntityManager.mutations()`                          | 在选主端之前对 create / update / delete 三组**整批预检**                   |
| `Repository.reorder()`                               | 开事务前自己按 `update` 判定（它的读邻居与写入走执行器，属不判定的那一层） |

其余写方法都收敛到上面几处：`EntityManager.save()` 单条时按实体状态走 `create()` / `update()` / `remove()`；`saveMany()` / `removeMany()` 与单条 `save()` 带出关联实体、待删中间表行时走 `mutations()`；实体实例的 `save()` / `remove()` 经 `EntityManager` 委托到同一批入口。

整批预检的语义：批内**任一**违规，整批拒绝、一条都不写；`PermissionDeniedError` 的违规清单列出批内**全部**违规的实体与操作，不止第一条——调用方一次就能看到要拆掉哪些写，而不是改一条撞一条。QueryCache 批次随后经门面逐条再判一次，结果与预检一致。

### PermissionDeniedError

`PermissionDeniedError` 是 `RxDBError` 的子类，带只读的违规清单：

```ts
class PermissionDeniedError extends RxDBError {
  readonly violations: readonly PermissionViolation[];
}

interface PermissionViolation {
  namespace: string; // 实体所在命名空间
  entity: string; // 实体名（元数据里的 name）
  operation: 'create' | 'update' | 'delete'; // 被拒绝的写操作
}
```

```ts
try {
  await entityManager.saveMany(entities);
} catch (error) {
  if (error instanceof PermissionDeniedError) {
    console.warn(error.violations.map(v => `${v.entity}.${v.operation}`));
  } else {
    throw error;
  }
}
```

单条入口被拒时清单恰一项。被拒时数据不变：被拒的 create 不留新行、update 后行原样、remove 后行仍在。

规则形式被拒时，清单项是扩展接口 `PermissionRuleViolation`，多带行 id、作用域、所需权限与原因，用 `isPermissionRuleViolation()` 区分；`'system'` 的清单项仍是上面三个字段，见[违规清单](#违规清单)。

### 不判定的路径

以下写入属于适配器 / 执行器层（系统写通道），不经过权限判定：

- `rxdb.getAdapter()`、`localAdapter$` / `remoteAdapter$` 拿到的适配器，其 `mutations()` / `saveMany()` / `removeMany()` / `transaction()` 执行器 / `rawQuery()`
- 投影改写：`rxdb.switchBranch()`、undo/redo、合并、拉取——它们重放的是已经发生过的写
- 外键级联（在 SQL 层执行）
- 图插件的 `addEdge()` / `removeEdge()`（写自动生成的边实体）

:::warning 没有「真不可变」
`'system'` 的意思是「公开写入口不开放」，不是给系统写发放行证，更不是真不可变：适配器层的同步、迁移、切分支、外键级联照样会写这些行。需要「创建后谁都改不了」时要用 SQL 触发器兜底并单独处理日志、分支与同步，那是另一个故事。
:::

## 三框架入口派生

实体管理界面的入口显隐统一由 `@aiao/rxdb-model` 的 `deriveEntityCapabilities()` 从元数据派生：

```ts
import { getEntityMetadata } from '@aiao/rxdb';
import { deriveEntityCapabilities } from '@aiao/rxdb-model';

const { canCreate, canEdit, canDelete } = deriveEntityCapabilities(getEntityMetadata(Invoice), {
  readOnly: rxdb.readOnly,
  grants: rxdb.grants.snapshot
});
```

| 能力        | 取值                | false 时的界面表现                                                                                 |
| ----------- | ------------------- | -------------------------------------------------------------------------------------------------- |
| `canCreate` | `create === 'both'` | 列表隐藏「+ 新增」                                                                                 |
| `canEdit`   | `update === 'both'` | 行挂 `_readonly`：单元格、粘贴、拖拽、键盘切换都不可写；「查看」以 view 模式打开详情（无保存入口） |
| `canDelete` | `delete === 'both'` | 操作列没有「删除」；「查看」保留                                                                   |

只读实例（`readOnly: true`，如只读检出位）三项全关。规则形式的操作按授权快照派生：实体级看快照里有没有一个带该前缀、且有所需权限的作用域，具体哪一行能改能删见[界面按行派生](#界面按行派生)。

删除能力与行只读是**解耦**的两件事：`update: 'system'` 的实体行只读但 `delete: 'both'` 时仍能删；`delete: 'system'` 的实体行可编辑却没有删除按钮。操作列 `actionsColumn()` 的第三参是逐行谓词 `(record) => boolean`，由 `buildEditableColumns()` 按行派生（规则形式按这一行的作用域）——直接调 `actionsColumn()` 的应用需要自己传入，见[操作列删除判定迁移](../migration/actions-column-can-delete.md)。

三框架的 `EntityList` 走同一条派生路径：

- Angular：`@aiao/rxdb-model-angular` 的 `rxdb-entity-list` 组件
- React：`@aiao/rxdb-model-react` 的 `EntityList` 组件
- Vue：`@aiao/rxdb-model-vue` 的 `EntityList` 组件

详情对话框的关系 Tab 内嵌的就是 `EntityList`，被关联实体走同一派生，不需要为关系 Tab 单独配置。

## 与同步、查询缓存的关系

- **系统写不判定，同步不受影响。** 同步推送与拉取、迁移登记、undo/redo、工作树提交都走适配器 / 执行器层。`create: 'system'` 的实体（如汇率表）仍能被同步拉取写入；把系统表声明成用户不可写，不会碰到同步、撤销与删分支。
- **QueryCache 批次在写发出之前就被整批预检。** `mutations()` 的预检在任何写发出之前完成，QueryCache 批次随后经门面逐条再判一次，结果一致——不会出现「前 N−1 条已写出、第 N 条才被拒」的半批状态。
- **多对多 Junction 默认 `'both'`**，关联到只读实体只写中间表行，放行。

## 按作用域的成员权限 {/* #scoped-member-permissions */}

`'both'` / `'system'` 分不出人。多租户、多成员的应用里，同一个人可以在一个租户是管理员、在另一个租户是员工：员工能看本租户的数据，但不能增删改。规则形式把这件事写成实体上的声明——一行属于哪个作用域、每个写操作要哪项成员权限——由公开写入口按行判定，而不是每个应用各写一遍「写前检查」再去和服务端的 RLS 对口径。

### 声明作用域与所需权限

```ts
import { Entity, EntityBase, PropertyType } from '@aiao/rxdb';

@Entity({
  name: 'CatalogItem',
  properties: [
    { name: 'name', type: PropertyType.string },
    { name: 'tenantId', type: PropertyType.string }
  ],
  access: { scope: { property: 'tenantId', prefix: 'tenant:' } },
  permissions: {
    create: { requires: 'edit' },
    update: { requires: 'edit' },
    delete: { requires: 'edit' }
  }
})
export class CatalogItem extends EntityBase {}
```

- **作用域键 = `prefix` + 属性值**：上例里租户 `xinghe` 的行属于 `tenant:xinghe`。`prefix` 缺省为空串。
- **作用域属性**必须是实体（含继承）上已声明的普通属性：`string` 或 `uuid`、不可空、不加密，不是计算属性，也不是关系生成的外键列。审计字段 `createdBy` / `updatedBy` 不能当作用域：它们可空，推送时还会被推送那一刻的身份覆盖。
- **权限名**只校验是非空字符串，不建注册表，语义归应用。Supabase 参考实现用 `read`（查看）、`edit`（增删改）、`comment`、`review`、`merge`、`manage`（调整成员权限）六项。
- **「仅所有者」是作用域的特例**：作用域取所有者属性、前缀 `user:`；把行转给别人就是换作用域，照规则被拒。
- 规则形式要求声明了 `access.scope`；`access` 与规则都按就近继承，`access` 整份就近（子类声明了就整体覆盖）。
- 只支持本地主端：实体生效的同步配置是 remote-only 或 `SyncType.QueryCache` 时初始化报错——判定要读本地事务里的持久化前像。图插件的 `@GraphEntity` 也不支持（`addEdge()` 不经门面写入口）。

声明写错（属性不存在、可空、类型不对，规则缺 `access`、`requires` 为空串、有未知键……）都在 `RxDB.init()` 报错，消息指出实体、键与原因。

### 判定

判定点与 `'system'` 相同，仍是公开写入口；同步合并、撤销 / 重做、外键级联、迁移这些系统写不判定。

| 操作   | 按哪一行的作用域                                   | 放行条件                                      |
| ------ | -------------------------------------------------- | --------------------------------------------- |
| create | 新行                                               | 快照在该作用域上有 `requires`                 |
| update | 持久化前像；改了作用域属性时，前像与写后的行都要判 | 两个作用域都有 `requires`：换租户两边都要能改 |
| delete | 持久化前像                                         | 快照在该作用域上有 `requires`                 |

- **按持久化前像**：update / delete 读的是库里这一行现在的值，不是内存里被改过的实例。前像与写入在本地主适配器的同一个事务里读，每个实体只读一次（`WHERE id IN (…)`），批量超过 100 行也一行不漏。
- **批量原子**：`saveMany()` / `removeMany()` / `mutations()` 里任一行被拒，整次调用拒绝，库里一条都没写。
- **授权未知一律拒绝**：快照还没取到时，声明了规则的写全部被拒，原因写「授权未知」。

#### 违规清单

规则形式的违规项是 `PermissionRuleViolation`：

```ts
interface PermissionRuleViolation extends PermissionViolation {
  id: string | number | bigint; // 被拒的行
  scope: string | null; // 行的作用域键；作用域属性没有值时为 null
  requires: string; // 所需的成员权限
  reason: 'missing-permission' | 'grants-unknown'; // 缺权限 / 快照还没取到
}
```

```ts
import { isPermissionRuleViolation, PermissionDeniedError } from '@aiao/rxdb';

try {
  await item.save();
} catch (error) {
  if (!(error instanceof PermissionDeniedError)) throw error;
  for (const violation of error.violations.filter(isPermissionRuleViolation)) {
    console.warn(`${violation.entity}#${violation.id}：${violation.scope} 上没有 ${violation.requires}`);
  }
}
```

一行一个作用域一条：update 换了作用域、两边都没有权限时是两条。

### 授权快照

调用者在各作用域上有哪些权限，由实例的授权快照 `rxdb.grants` 说明：

```ts
const snapshot = rxdb.grants.snapshot; // RxDBGrantSnapshot
snapshot.status; // 'unknown'（还没取到）| 'known'
snapshot.has('tenant:xinghe', 'edit'); // 未取到时恒为 false
rxdb.grants.snapshot$.subscribe(render); // 订阅时先交出当前值，之后只在内容变化时发出
```

快照有两种来源，一个实例只认一个：

| 来源     | 什么时候                                                                       | 怎么更新                                                                                     |
| -------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| 远端     | 有实体声明了作用域，且远端适配器报告授权（Supabase 读 `rxdb_caller_grants()`） | 远端连接时、同步每一轮进门时、调 `rxdb.grants.refresh()` 时各问一次远端；应用调 `set()` 被拒 |
| 应用设入 | 其余情况：没有远端、远端不报告授权                                             | `await rxdb.grants.set([{ scope: 'tenant:a', permissions: ['read', 'edit'] }])`              |

问远端之前先核对调用者身份（声明了 `RxDBOptions.identity` 时）：授权是要落进这个身份的库的数据。没有实体声明作用域时，远端一次都不问，没部署授权函数的旧服务端照常可用。

快照写进本地库的系统表 `rxdb_grant_state`：本地库按身份分库，换身份就是换库，快照不跨库；离线关库重开，`connect()` 读回上次的快照，照样按它判定。远端在本地库之前连上时，那一次只发布、不落库，下一次刷新再落库。快照是每个实例自己的，一个标签页刷新不会推到别的标签页。

### 界面按行派生

三框架的 `EntityList` 订阅 `rxdb.grants.snapshot$`，规则形式的入口随快照即时重算，不用刷新页面：

| 入口         | 什么时候出                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------------ |
| 「+ 新增」   | 快照里有一个**带该前缀**的作用域有 `create` 所需的权限：调用者 `user:` 区的 `edit` 不让 `tenant:` 实体开新增 |
| 行可编辑     | 这一行的作用域上有 `update` 所需的权限；否则行挂 `_readonly`，「查看」以 view 模式打开                       |
| 行的「删除」 | 这一行的作用域上有 `delete` 所需的权限                                                                       |
| 拖拽排序     | 手动排序的实体只要有一行只读，整表不出拖拽                                                                   |

快照还没取到时，规则形式的入口全关，列表顶部说明原因（「还没取到授权」）；只读实例同样说明原因。

自己拼界面时用同一套派生：

```ts
import { deriveRowCapabilities, deriveWriteBlockedReason } from '@aiao/rxdb-model';

const context = { readOnly: rxdb.readOnly, grants: rxdb.grants.snapshot };
const { canEdit, canDelete, editReason } = deriveRowCapabilities(metadata, row, context);
// 不能时的原因：'read-only-instance' | 'system' | 'grants-unknown' | 'missing-permission'
const blocked = deriveWriteBlockedReason(metadata, context); // 'read-only-instance' | 'grants-unknown' | undefined
```

- 不传 `grants` 与快照未取到一样，规则形式一律关闭。直接调 `buildEditableColumns()` 的应用要传 `grants`，并在快照变化时重建列，否则规则形式的行不出「删除」。
- 按行派生看的是这一行**此刻**的值，写入口按持久化前像判定，保存之后两者一致。界面只是快速反馈，被拒以写入口为准（`PermissionDeniedError`，见[违规清单](#违规清单)）。
- `EntityList` 没有批量删除入口；`removeMany()` / `mutations()` 的整批拒绝见[判定](#判定)。

### 离线与降权窗口

本机判定用的是**上一次取到的快照**：

- **离线**：远端连接时连不上远端，沿用上次的快照，连接照常完成；远端没部署授权函数这类配置错误则让连接失败（Supabase 报 `SupabaseConfigError`，点名函数与部署文档）。
- **降权窗口**：远端刚把某人从管理员降为员工，本机在下一次刷新（下一轮同步、或应用调 `refresh()`）之前还按旧快照放行。这期间写下的修改推送时由服务端拒绝，按逐实体回执对齐本机（见[被拒的推送](../plugins/rxdb-plugin-sync/README.md#被拒的推送)）；同步刷新快照之后，本机写当场被拒。

:::warning 快速失败，不是安全边界
本机判定只是让越权的写当场失败、不留一条注定被拒的待推修改。它挡不住直接改本地库、走适配器 / 执行器层的写；真正的边界只在服务端的 RLS。
:::

### 与 RLS 对口径

本机判定与服务端裁决要说同一件事，三处要对齐：

1. **作用域键一致**：实体的 `access.scope`（`property: 'tenantId', prefix: 'tenant:'`）拼出的键，与写策略里的 `'tenant:' || tenant_id`、`rxdb_caller_grants()` 返回的 `scope` 是同一个字符串。
2. **所需权限一致**：规则的 `requires: 'edit'` 与写策略判的权限相同（Supabase 参考实现：`= ANY((SELECT public.rxdb_caller_scopes('edit'))::text[])`）。
3. **同一份授权**：快照来自 `rxdb_caller_grants()`，写策略经 `rxdb_caller_scopes()` 读的也是它，成员表改了，下一次请求两边一起变。

Supabase 的参考 SQL、写策略与升级步骤见[配置成员权限](../adapters/supabase.md#配置成员权限)与[迁移说明](../migration/supabase-member-permissions.md)。

## 继续阅读

- [模型定义](/model-definition/README.md)
- [模型修改](/model-mutation/README.md)
- [操作列删除判定迁移](../migration/actions-column-can-delete.md)
