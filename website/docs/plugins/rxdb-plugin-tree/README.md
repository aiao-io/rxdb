# @aiao/rxdb-plugin-tree

`@aiao/rxdb-plugin-tree` 为 RxDB 提供邻接表模型的树形结构：实体基类、装饰器、`TreeRepository`，以及四个树查询的**真增量 merge**。

这套能力曾经内置在 `@aiao/rxdb`。核心里躺着 4 个树查询 task 类型、3 个 merge switch 的树分支和约 1100 行树专属合并逻辑——它们从永远加载的 switch 里可达，tree-shaking 甩不掉，不用树的应用照样付这份体积。外移之后，装插件才有树。

它适合这些场景：

- 菜单树、目录树、文件树
- 组织架构、分类体系
- 任意「一个可空父节点 + 查祖先/后代」的模型

## 提供什么

- `@TreeEntity()`：声明树实体（把仓储类型默认设为 `TreeRepository`）
- `TreeAdjacencyListEntityBase`：提供 `parentId`、`parent$`、`children$`、`hasChildren` 与四个树查询静态方法
- `findDescendants()` / `countDescendants()` / `findAncestors()` / `countAncestors()`：树查询接口
- `TreeRepository`：树查询的默认仓储实现与增量 merge 注册

## 安装

```bash npm2yarn
npm install @aiao/rxdb @aiao/rxdb-plugin-tree
```

## 使用

```typescript
import { PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { TreeAdjacencyListEntityBase, TreeEntity, rxDBPluginTree } from '@aiao/rxdb-plugin-tree';

@TreeEntity({
  name: 'Category',
  properties: [{ name: 'name', type: PropertyType.string }],
  features: { tree: { hasChildren: true } }
})
class Category extends TreeAdjacencyListEntityBase {
  name!: string;
}

const rxdb = new RxDB({
  dbName: 'catalog',
  entities: [Category],
  sync: { type: SyncType.None, local: { adapter: 'wa-sqlite' } }
});

// 必须在 init() 之前 use()：仓储注册发生在 init() 内部，早于实体元数据校验。
rxdb.use(rxDBPluginTree).adapter('wa-sqlite', db => new RxDBAdapterWaSqlite(db, { vfs: 'MemoryAsyncVFS' }));

await rxdb.connect('wa-sqlite');
rxdb.init();

Category.findDescendants({ entityId: rootId, level: 2 }).subscribe(nodes => {
  console.log(nodes.length);
});
```

不装插件而实体声明了 `repository: 'TreeRepository'`（`@TreeEntity` 会自动写上），`init()` 直接抛错并列出当前已注册的仓储名。

## 查询语义

`level` 包含当前节点本身：`level: 0` 只有当前节点，`level: 1` 是当前节点 + 直接子节点。数字以外的值（字符串、小数、NaN）在适配器层直接抛 `RxDBError`，没有兜底。

- `findDescendants` / `countDescendants`：指定 `entityId` 时**不含**当前节点；不指定时覆盖所有根节点及其后代。
- `findAncestors` / `countAncestors`：指定 `entityId` 时**含**当前节点。

## 增量 merge

树查询与图查询不同：图查询一律回 SQL `refresh()`，树查询走真增量。`TreeRepository` 构造时按 task 类型注册 `merge_create` / `merge_update` / `merge_remove`，三道前置守卫之后才进增量路径：

1. `task.result === undefined` → refresh；
2. 事件里有过期实体（`isStaleEntityEvent`）→ refresh；
3. `findAncestors` 且 `parentId` 变过 → refresh（祖先链已被改写，增量无从谈起）。

`find*` 走 recalculate，`count*` 走 refresh。用到的 merge 原语（`classifyUpdates` / `applyExternalEntityUpdate` / `invalidateEntityFingerprint` 等）由 `@aiao/rxdb` 公开导出，进基线后受兼容承诺约束。

## 连接纪元

插件声明 `lifecycle: 'scoped'`，唯一的宿主改动——注册 `TreeRepository`——登记在 `install(scope)` 收到的作用域上，`disconnectAll()` 时随作用域一起撤销。重新 `connect()` 会重新注册。

## 框架绑定

四个树查询 hook 在各自的框架包里，三端同名同形：

| 框架    | 包                               | 入口                                                                                    |
| :------ | :------------------------------- | :-------------------------------------------------------------------------------------- |
| Angular | `@aiao/rxdb-plugin-tree-angular` | `useFindDescendants` / `useCountDescendants` / `useFindAncestors` / `useCountAncestors` |
| React   | `@aiao/rxdb-plugin-tree-react`   | 同上                                                                                    |
| Vue     | `@aiao/rxdb-plugin-tree-vue`     | 同上                                                                                    |

装插件仍在库侧完成（`rxdb.use(rxDBPluginTree)`），绑定包只负责订阅与状态容器。

## 适配器

`TreeRepository` 的名字没变，适配器仍按字符串 `'TreeRepository'` 分发，公开 API 一字未动。PGlite / SQLite / Supabase 三家的 `*TreeRepository` 只把类型来源改到了本包。

## 推荐阅读

- [树结构建模](../../model-definition/structure-tree.md)
- [findDescendants](../../model-query/findDescendants.md) / [findAncestors](../../model-query/findAncestors.md)
- [树结构拆包迁移](../../migration/tree-split.md)
- [API 文档](../../api/README.md)
