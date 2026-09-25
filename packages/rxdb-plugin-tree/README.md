# @aiao/rxdb-plugin-tree

> Implements: [US-025 核心插件化拆分](https://github.com/aiao-io/rxdb/blob/main/requirements/stories/core/US-025-core-plugin-extraction.md)

RxDB 树形结构插件：邻接表模型的实体基类、装饰器、`TreeRepository`，以及四个树查询的**真增量 merge**。

这套能力曾经内置在 `@aiao/rxdb`。核心里躺着 4 个树 task 类型、3 个 merge switch 的树分支和约 1100 行树专属合并逻辑——它们从永远加载的 switch 里可达，tree-shaking 甩不掉，不用树的应用照样付这份体积。外移之后，装插件才有树。

## 安装

```bash
pnpm add @aiao/rxdb @aiao/rxdb-adapter-wa-sqlite @aiao/rxdb-plugin-tree
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

Category.findDescendants({ entityId: root.id, level: 2 }).subscribe(nodes => {
  console.log(nodes.length);
});
```

不装插件而实体声明了 `repository: 'TreeRepository'`（`@TreeEntity` 会自动写上），`init()` 直接抛错并列出当前已注册的仓储名。

## 公开面

| 分类 | 符号                                                                                         |
| ---- | -------------------------------------------------------------------------------------------- |
| 插件 | `RxDBPluginTree`、`rxDBPluginTree`                                                           |
| 实体 | `TreeAdjacencyListEntityBase`、`TREE_ADJACENCY_LIST_ENTITY_BASE_OPTIONS`、`@TreeEntity`      |
| 类型 | `ITreeEntity`、`ISortableTreeEntity`、`TreeEntityType`、`EntityMetadataTreeFeatures`         |
| 仓储 | `TreeRepository`、`ITreeRepository`、`FindTreeOptions`                                       |
| 查询 | `FindDescendantsQuery`、`FindAncestorsQuery`、`CountDescendantsQuery`、`CountAncestorsQuery` |

四个查询 task 类型经 `RepositoryQueryExtensions` 模块增强挂进核心的 `QueryOptions` 联合——这是插件给核心闭合联合加分支的唯一缝。

## 查询语义

`level` 包含当前节点本身：`level: 0` 只有当前节点，`level: 1` 是当前节点 + 直接子节点。数字以外的值（字符串、小数、NaN）在适配器层直接抛 `RxDBError`，没有兜底。

- `findDescendants` / `countDescendants`：指定 `entityId` 时**不含**当前节点；不指定时覆盖所有根节点及其后代。
- `findAncestors` / `countAncestors`：指定 `entityId` 时**含**当前节点。

## 增量 merge

树查询与图查询不同：图查询一律回 SQL `refresh()`，树查询走真增量。`TreeRepository` 构造时按 task 类型注册 `merge_create` / `merge_update` / `merge_remove`，三道前置守卫之后才进增量路径：

1. `task.result === undefined` → refresh；
2. 事件里有过期实体（`isStaleEntityEvent`）→ refresh；
3. `findAncestors` 且 `parentId` 变过 → refresh（祖先链已被改写，增量无从谈起）。

`find*` 走 recalculate，`count*` 走 refresh。用到的 merge 原语（`prepareIncrementalUpdate` / `applyExternalEntityUpdate` / `getEntityId` 等）由 `@aiao/rxdb` 公开导出，进基线后受兼容承诺约束；`classifyUpdates` 与 `invalidateEntityFingerprint` 是核心内部装配细节，不在公开面上。

## 连接纪元

插件声明 `lifecycle: 'scoped'`，唯一的宿主改动——注册 `TreeRepository`——登记在 `install(scope)` 收到的作用域上，`disconnectAll()` 时随作用域一起撤销。重新 `connect()` 会重新注册。

## 框架绑定

四个树查询 hook 在各自的框架包里，三端同名同形：

- Angular：[`@aiao/rxdb-plugin-tree-angular`](../rxdb-plugin-tree-angular)
- React：[`@aiao/rxdb-plugin-tree-react`](../rxdb-plugin-tree-react)
- Vue：[`@aiao/rxdb-plugin-tree-vue`](../rxdb-plugin-tree-vue)

## 适配器

`TreeRepository` 的名字没变，适配器仍按字符串 `'TreeRepository'` 分发，公开 API 一字未动。PGlite / SQLite / Supabase 三家的 `*TreeRepository` 只把类型来源改到了本包。

## 迁移

从内置树升级见 [tree-split 迁移说明](https://github.com/aiao-io/rxdb/blob/main/website/docs/migration/tree-split.md)。

## 开发命令

```bash
pnpm nx test rxdb-plugin-tree              # node 环境，只跑构建期生成器 spec
pnpm nx run rxdb-plugin-tree:test-browser  # 先跑 node 趟（依赖 coverage target），再在真实 chromium 里跑运行时 spec
```

`vite.config.mts` 按 `VITEST_BROWSER` 环境变量把测试拆成两趟：不设该变量时（`nx test` 走的路径）排除全部 `*.browser.spec.ts`，只剩 `src/__tests__/generator/` 下的构建期生成器 spec；查询 / 合并 / 仓储等运行时 spec 都以 `.browser.spec.ts` 结尾，只有 `VITEST_BROWSER=true`（即 `test-browser`）才会执行。

所以 `pnpm nx test rxdb-plugin-tree --watch` 做 TDD 会**静默**跳过全部运行时 spec——改了查询 / 合并 / 仓储代码，红没红只有 `test-browser` 看得到。

## License

[MIT](https://github.com/aiao-io/rxdb/blob/main/LICENSE)
