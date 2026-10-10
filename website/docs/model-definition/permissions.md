# 实体操作权限

每个实体可以对三个写操作——创建、更新、删除——逐个声明它对谁开放：

- `'both'`：用户与系统都能写（默认，与现状一致）
- `'system'`：只留给系统写，用户经公开写入口写会被当场拒绝并指名实体与操作

同一份声明同时驱动两件事：写入口的快速失败（抛 `PermissionDeniedError`），以及实体管理界面（Angular / React / Vue 的 `EntityList`）的新增、编辑、删除入口显隐。权限声明在 `@aiao/rxdb` 核心包里，不需要额外安装。

:::warning 这是快速失败，不是防御边界
权限判定只设在公开写入口（门面 `Repository` 与 `EntityManager`）。适配器 / 执行器层的写不判定——同步拉取、迁移、历史回放、工作树物化都走那一层。所以「没报错」不代表「拦住了」；要真正的不可变需要 SQL 触发器兜底，那超出了本模型的语义。
:::

## 它解决什么

在权限模型之前，系统表只能靠逐字段 `readonly` 和 `isSystemEntity()` 特判来维持只读：逐字段标记拦不住新建与删除，漏标一个新字段就裸奔。权限模型把「能不能动这个实体」收敛成实体上的一条声明：

- 14 张系统表（核心 4 张 + working-tree 插件贡献 10 张）显式声明三操作都为 `'system'`，整表对用户只读
- 业务里只由同步 / 迁移写入的实体（如汇率表）可以只收紧 `create`，UI 随之隐藏「+ 新增」
- 三框架 UI 按同一份声明派生入口，而不是各自维护一套特判

与字段级 `readonly` 的分工：实体级权限是「门」（这个实体的操作对用户开不开放），字段级 `readonly` 是「栅」（可编辑实体内哪些字段更新时不改写）。两者互不覆盖——可编辑实体内声明了 `readonly: true` 的字段照旧不被更新改写。

## 声明方式

权限类型来自 `@aiao/rxdb`：

```ts
type EntityOperation = 'create' | 'update' | 'delete';
type EntityOperationPermission = 'both' | 'system';

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
    delete: 'system'  // 用户不能删：操作列没有「删除」
  }
})
export class ExchangeRate extends EntityBase {}
```

| 取值       | 含义                                                                 |
| ---------- | -------------------------------------------------------------------- |
| `'both'`   | 用户与系统都能写（默认）                                             |
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

系统表是「14 张表各自显式声明」：核心 4 张 + working-tree 插件贡献 10 张，每张都在自己的 `@Entity` 上写着 `permissions: SYSTEM_ENTITY_PERMISSIONS`（即三操作都为 `'system'`）。

核心 4 张（`packages/rxdb/src/system/`）：

| 实体             | 说明       |
| ---------------- | ---------- |
| `RxDBBranch`     | 分支表     |
| `RxDBChange`     | 变更日志表 |
| `RxDBMigration`  | 迁移登记表 |
| `RxDBSync`       | 同步水位表 |

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

| 入口                                      | 判定时机                                     |
| ----------------------------------------- | -------------------------------------------- |
| 门面 `Repository.create()` / `update()` / `remove()` | 在 `primary$` 选主端之前——与主端选哪边无关，被拒时连适配器都不碰 |
| `EntityManager.mutations()`               | 在选主端之前对 create / update / delete 三组**整批预检** |
| `Repository.reorder()`                    | 开事务前自己按 `update` 判定（它的读邻居与写入走执行器，属不判定的那一层） |

其余写方法都收敛到上面几处：`EntityManager.save()` 单条时按实体状态走 `create()` / `update()` / `remove()`；`saveMany()` / `removeMany()` 与单条 `save()` 带出关联实体、待删中间表行时走 `mutations()`；实体实例的 `save()` / `remove()` 经 `EntityManager` 委托到同一批入口。

整批预检的语义：批内**任一**违规，整批拒绝、一条都不写；`PermissionDeniedError` 的违规清单列出批内**全部**违规的实体与操作，不止第一条——调用方一次就能看到要拆掉哪些写，而不是改一条撞一条。QueryCache 批次随后经门面逐条再判一次，结果与预检一致。

### PermissionDeniedError

`PermissionDeniedError` 是 `RxDBError` 的子类，带只读的违规清单：

```ts
class PermissionDeniedError extends RxDBError {
  readonly violations: readonly PermissionViolation[];
}

interface PermissionViolation {
  namespace: string;                        // 实体所在命名空间
  entity: string;                           // 实体名（元数据里的 name）
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

const { canCreate, canEdit, canDelete } = deriveEntityCapabilities(getEntityMetadata(Invoice));
```

| 能力        | 取值                 | false 时的界面表现                                                                                    |
| ----------- | -------------------- | ----------------------------------------------------------------------------------------------------- |
| `canCreate` | `create === 'both'`  | 列表隐藏「+ 新增」                                                                                    |
| `canEdit`   | `update === 'both'`  | 行挂 `_readonly`：单元格、粘贴、拖拽、键盘切换都不可写；「查看」以 view 模式打开详情（无保存入口） |
| `canDelete` | `delete === 'both'`  | 操作列没有「删除」；「查看」保留                                                                       |

删除能力与行只读是**解耦**的两件事：`update: 'system'` 的实体行只读但 `delete: 'both'` 时仍能删；`delete: 'system'` 的实体行可编辑却没有删除按钮。操作列 `actionsColumn()` 的第三参是逐行谓词 `(record) => boolean`，由 `buildEditableColumns()` 按 `canDelete` 派生——直接调 `actionsColumn()` 的应用需要自己传入，见[操作列删除判定迁移](../migration/actions-column-can-delete.md)。

三框架的 `EntityList` 走同一条派生路径：

- Angular：`@aiao/rxdb-model-angular` 的 `rxdb-entity-list` 组件
- React：`@aiao/rxdb-model-react` 的 `EntityList` 组件
- Vue：`@aiao/rxdb-model-vue` 的 `EntityList` 组件

详情对话框的关系 Tab 内嵌的就是 `EntityList`，被关联实体走同一派生，不需要为关系 Tab 单独配置。

## 与同步、查询缓存的关系

- **系统写不判定，同步不受影响。** 同步推送与拉取、迁移登记、undo/redo、工作树提交都走适配器 / 执行器层。`create: 'system'` 的实体（如汇率表）仍能被同步拉取写入；把系统表声明成用户不可写，不会碰到同步、撤销与删分支。
- **QueryCache 批次在写发出之前就被整批预检。** `mutations()` 的预检在任何写发出之前完成，QueryCache 批次随后经门面逐条再判一次，结果一致——不会出现「前 N−1 条已写出、第 N 条才被拒」的半批状态。
- **多对多 Junction 默认 `'both'`**，关联到只读实体只写中间表行，放行。

## 继续阅读

- [模型定义](./README.md)
- [模型修改](../model-mutation/README.md)
- [操作列删除判定迁移](../migration/actions-column-can-delete.md)
