# 手动排序（manualOrder 与 reorder）

手动排序是实体级显式 opt-in 的能力：声明 `manualOrder` 后，引擎接管实体的 `sortOrder` 键——查询不带 `orderBy` 时默认按手动顺序返回，缺键创建自动追加到组末尾，`Repository.reorder()` 把一行移到目标位置。排序能力在核心包 `@aiao/rxdb`，与树插件无关，不装 `@aiao/rxdb-plugin-tree` 也能用。

## 声明

在 `@Entity()` 装饰器选项里声明 `manualOrder`，两种形态：

- `manualOrder: true`——整表一条序列
- `manualOrder: { groupBy: [...] }`——按分组字段各自一条序列（排序域）

```ts
import { EntityBase, Entity, ISortableEntity, PropertyType, SortOrderKey } from '@aiao/rxdb';

// 整表一条序列：分类、菜单这类扁平列表
@Entity({
  name: 'Category',
  manualOrder: true,
  properties: [
    { name: 'name', type: PropertyType.string },
    { name: 'sortOrder', type: PropertyType.string }
  ]
})
class Category extends EntityBase implements ISortableEntity {
  name!: string;
  sortOrder!: SortOrderKey;
}

// 分组排序域：每个看板列内各自一条序列
@Entity({
  name: 'Task',
  manualOrder: { groupBy: ['completed'] },
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'completed', type: PropertyType.boolean },
    { name: 'sortOrder', type: PropertyType.string }
  ]
})
class Task extends EntityBase implements ISortableEntity {
  title!: string;
  completed!: boolean;
  sortOrder!: SortOrderKey;
}
```

声明要点：

- 显式 opt-in：只有声明了才启用，恰好有 `sortOrder` 字段但未声明的实体行为完全不变
- `sortOrder` 字段由开发者自己声明，引擎不注入：必须是 string、可写、非计算、非加密、非空（建表即 `NOT NULL`），违反在注册期明确报错
- 分组字段只能是实体自身的标量列（含多对一外键列，如 `categoryId`），非计算、可写、非加密；NULL 是一个独立的组，默认排序里排在最前
- `ISortableEntity` 只是 TS 便利类型（`sortOrder: SortOrderKey`，`SortOrderKey` 就是 `string` 别名），不是运行期声明——运行期以 `@Entity({ manualOrder })` 为准
- 沿原型链就近继承，子类可写 `false` 关掉或改写分组字段
- 键由 fractional indexing（默认字母表）生成，按码点字典序比较；各组各自从 `a0` 起，组间键可以重复

:::warning 给已有实体启用

已有表的列不会改成 `NOT NULL`——引擎只补建缺失的表、不改列。给已有实体启用时，存量行必须在迁移里显式回填键；要 DDL 层非空只能另建新实体。

:::

## 默认排序契约

对声明了 `manualOrder` 的实体，查询不带 `orderBy` 时归一化为：

- 整表排序：`[sortOrder asc, id asc]`
- 分组排序：`[分组字段… asc, sortOrder asc, id asc]`，NULL 组排在最前

覆盖 `Repository` 的 `find` / `findAll` / `findOne` / `findOneOrFail` 四个读入口（`count` 不排序、`get` 按 id 取单行、`findByCursor` 强制显式 `orderBy`）。调用方显式给出的 `orderBy` 原样尊重，不追加、不改写。

## 自动追加

- **创建时缺键**：经 `Repository.create` / `EntityManager.create` / 实体 `save()`（新建）/ `saveMany` / `mutations` 创建、且没给 `sortOrder` 时，追加到该行所属排序域的末尾（只读本组尾键，空组得 `a0`）
- **同批创建**：按组拆分，每组按批内顺序一次生成，互不碰撞
- **改分组字段**：普通 update 改了任一分组字段、同一次写入又没给 `sortOrder` 时，在同一个主适配器事务内把该行追加到新组末尾；原组其余行一条不改写。同批多行按新组拆分追加
- **显式键**：显式传入合法键原样保留；显式传入非法键明确报错（`SortOrderError` 的 `invalidKey`）
- 非用户来源（同步拉取、恢复、history 回放）原样写入，不分配、不改写键

批量场景的批内追加（`appendToGroupTails`）带优化：同批新建父行的组不读尾键（`KnownEmptyGroup` 判定），与既有组的追加同序。

## Repository.reorder()

```ts
const repository = rxdb.entityManager.getRepository(Category);

// 组内移动：插到 a 行与 b 行之间（组首 / 组尾时一侧为 null）
await repository.reorder(movedId, { prevId: a.id, nextId: b.id });

// 追加到组末尾：整表排序为 {}
await repository.reorder(movedId, { group: {} });

// 跨组移动：追加到「已完成」组末尾
await repository.reorder(todoId, { group: { completed: true } });
```

`reorder(id, target)` 的输入是移动意图，不是最终排列。目标位置两种形态：

- `{ prevId, nextId }`——组内邻居：移到组首 / 组尾时一侧为 `null`；两侧都为 `null` 不合法，要移到末尾请用 `{ group }`
- `{ group: {...} }`——追加到某组末尾：键集合必须恰好是声明的分组字段（整表排序为 `{}`），目标组与当前组不同即跨组移动，同一事务内只写分组字段与 `sortOrder`

写路径保证：

- 读邻居、复核相邻、算键、写入都在主适配器的同一个事务内；事务内复核移动行仍存在、两邻居同属目标组且仍相邻，任一不成立即拒绝、零写
- 组内移动只写 `sortOrder`；跨组移动只写分组字段与 `sortOrder`，不连带保存实例上其他未提交的改动
- 已在目标位置时零写、原样返回
- 声明 `update: 'system'` 的实体在开事务前抛 `PermissionDeniedError`、零写
- 主端是 remote-only 或 QueryCache 时拒绝（`unsupportedPrimary`）——本地只有序列子集，拿它算键会与远端不一致

## 错误处理

重排失败抛 `SortOrderError`，抛出时一条写都没有提交——校验全部发生在写之前，事务内复核失败则整个事务不提交。按 `reason` 分流：

| reason               | 含义                                                                      | 处理         |
| -------------------- | ------------------------------------------------------------------------- | ------------ |
| `notManualOrder`     | 实体没有声明 `manualOrder`，却调用了重排                                  | 调用方错误   |
| `invalidKey`         | 用户显式写入的排序键不合法                                                | 调用方错误   |
| `corruptAnchor`      | 库里作为锚点读到的键（尾键 / 邻居）不合法，或两邻居不满足 `prev < next`   | 数据已脏     |
| `unsupportedPrimary` | 主端是 remote-only 或 QueryCache，读不到完整序列                          | 不支持的后端 |
| `invalidTarget`      | 目标本身不成立：两侧邻居都为空、邻居就是移动行、`group` 的键与分组字段不符 | 调用方错误   |
| `notFound`           | 被移动的行已不存在                                                        | 重查         |
| `staleTarget`        | 邻居已不存在、不再相邻或不在同一组——调用方看到的顺序过期                  | 重查后重试   |

```ts
import { SortOrderError } from '@aiao/rxdb';

try {
  await repository.reorder(id, { prevId, nextId });
} catch (error) {
  if (error instanceof SortOrderError && error.reason === 'staleTarget') {
    refresh(); // 并发下的正常结果：重查后重试
  } else {
    throw error;
  }
}
```

`staleTarget` / `notFound` 是并发下的正常结果，重查后重试即可；其余是调用方或数据的问题，重试不会变。

## 工具函数

核心导出六个判定与换算原语，UI 与导入脚本在写之前先判，插件模拟仓库时与核心同源：

- `assertSortOrderKey(entity, key): asserts key is SortOrderKey`——断言排序键合法：空串 / 非字符串 / 格式不合法 / 不属于默认字母表时抛 `SortOrderError`（`invalidKey`）
- `isManualOrderEntity(metadata)`——实体是否启用了手动排序
- `manualOrderGroupFields(metadata)`——按声明顺序的分组字段；整表排序或未启用时为空数组
- `normalizeManualOrderBy(metadata, options)`——把查询选项归一化成默认排序：未给 `orderBy`（或给了空数组）时返回补成 `[分组字段… asc, sortOrder asc, id asc]` 的新对象，否则原样返回

后两个换算函数把拖放落点换算成 `reorder()` 的邻居目标：

```ts
// 平铺列表：把「第 fromIndex 行拖到第 toIndex 行」换算成邻居目标
const target = reorderTargetForMove(rows.map(row => row.id), fromIndex, toIndex);
if (target) await repository.reorder(rows[fromIndex].id, target);

// 树 / 跨组拖放：把「放到目标行上方 / 下方」换算成邻居目标
const target = reorderTargetForDrop(siblingIds, draggedId, overId, 'after');
if (target) await repository.reorder(draggedId, target);
```

- `reorderTargetForMove(ids, fromIndex, toIndex)`——原位放下（`fromIndex === toIndex`）返回 `null`，调用方不应发起重排；下标非法或序列不足两行抛 `RangeError`
- `reorderTargetForDrop(groupIds, movedId, targetId, position)`——`position` 为 `'before'` / `'after'`；`groupIds` 必须是目标组的完整序列（含被过滤隐藏、不在渲染窗口内的行），只拿可见行会把隐藏的兄弟夹进两个邻居之间、被 `reorder()` 判 `staleTarget`；被拖行已在该位置时返回 `null`

取元数据用 `getEntityMetadata(Task)`。

## 与树插件的关系

排序能力在 `@aiao/rxdb` 核心：查询默认排序与创建追加都在引擎写路径上，扁平列表排序不需要装树插件；依赖方向是树插件 → 排序模块。

- 树实体声明 `manualOrder: { groupBy: ['parentId'] }`（`sortOrder` 非空）后，同一父节点下的兄弟就是一个排序域，根节点是 NULL 组
- `TreeRepository` 继承 `Repository`，天然获得 `reorder()`
- 跨父拖放就是跨组移动：追加到目标节点的子节点末尾，不读目标的子节点，目标未展开时同样正确

```ts
await repository.reorder(draggedId, { group: { parentId: target.id } });
```

环检测不在 `reorder()` 里——拖进自己的后代要在调用方先拒绝。树插件的 `ISortableTreeEntity` 只借核心的 `SortOrderKey` 类型组合出可空的 `sortOrder`，实现它不会获得手动排序声明。见[树结构 (Tree)](../model-definition/structure-tree.md) 的「可排序树实体」小节。

## 与 rxdb-model 实体列表的拖拽

三框架 `EntityList` 对满足条件的可排序实体自动开启拖拽手柄（string 主键、`normal` 排序状态、数据完整加载、无草稿 / 待提交编辑等），拖放经 `reorderTargetForMove` 换算成邻居目标后调用 `Repository.reorder()`；失败恢复最新已提交顺序并展示错误，下一次拖拽可用。使用与细节见 [实体模型（rxdb-model）实体列表](../entity-model/README.md)。

## 继续阅读

- [模型修改](./README.md)
- [树结构 (Tree)](../model-definition/structure-tree.md)
- [findDescendants](../model-query/findDescendants.md) / [findAncestors](../model-query/findAncestors.md)
