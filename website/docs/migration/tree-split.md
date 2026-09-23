# 树结构拆包：核心 → `@aiao/rxdb-plugin-tree`

树形结构（邻接表模型）从 `@aiao/rxdb` 核心抽成了独立插件包，**下一个发布版本起**生效：实体基类、`@TreeEntity` 装饰器、`TreeRepository`、四个树查询 task 类型、以及约 1100 行树专属增量 merge 全部随 `@aiao/rxdb-plugin-tree` 走。三框架的四个树 hook 同时搬进 `@aiao/rxdb-plugin-tree-{angular,react,vue}`。

**不涉及数据迁移。** 表结构、`parentId` 列、已有数据一样都没动——仓储名仍是 `'TreeRepository'`，适配器公开 API 一字未变。要改的只有依赖清单、import 来源、以及一行 `use()`。按[版本与 API 稳定性策略](../versioning.md)，0.x 期间次版本即可包含破坏性变更。

## 为什么拆

树是「装上才存在」的能力，但拆出之前它的成本由**所有人**承担：核心的 `QueryOptions` 闭合联合里躺着 4 个树 task 类型，`merge_create` / `merge_update` / `merge_remove` 三个 switch 里各有一组树 case，`EntityMetadataFeatures.tree` 挂在核心元数据上。这些代码从永远加载的 switch 里可达，tree-shaking 无效——不用树的应用一行也甩不掉。

拆出之后：未装本包的应用不再付这份体积；树查询的增量 merge 改由插件自己按 task 类型注册（`QueryManager.registerMerge{Create,Update,Remove}Fn`），核心只保留通用 merge 原语。

## 1. 安装

```bash npm2yarn
npm install @aiao/rxdb-plugin-tree
# 框架绑定（按需选其一）
npm install @aiao/rxdb-plugin-tree-angular
npm install @aiao/rxdb-plugin-tree-react
npm install @aiao/rxdb-plugin-tree-vue
```

不用树的应用**不需要装**，也不会有任何行为差异。

## 2. `use()` 必须排在 `init()` 之前

```typescript
import { RxDB } from '@aiao/rxdb';
import { rxDBPluginTree } from '@aiao/rxdb-plugin-tree';

const db = new RxDB(config);
db.use(rxDBPluginTree); // ← 必须在 connect() / init() 之前
await db.connect('sqlite-wasm');
```

`use()` 只登记，真正的安装发生在 `init()` 内部、实体元数据校验之前。漏了这一步，声明过 `@TreeEntity` 的实体在 `init()` 时报错，消息里会列出当前已注册的仓储名：

```
Repository 'TreeRepository' not found for entity 'Menu'. 已注册的仓储：Repository, GraphRepository。
该仓储由插件注册，请确认已在 init() 之前 rxdb.use(...) 对应插件。
```

## 3. 符号搬家对照

### 核心包 → 插件包

`@aiao/rxdb` 不再导出下列符号，改从 `@aiao/rxdb-plugin-tree` 取：

| 符号                                                                                            | 说明                         |
| :---------------------------------------------------------------------------------------------- | :--------------------------- |
| `TreeEntity`                                                                                    | 装饰器                       |
| `TreeAdjacencyListEntityBase` / `TREE_ADJACENCY_LIST_ENTITY_BASE_OPTIONS`                       | 实体基类与其选项             |
| `ITreeEntity` / `ISortableTreeEntity` / `TreeEntityType`                                        | 实体类型                     |
| `TreeRepository` / `ITreeRepository` / `FindTreeOptions`                                        | 仓储与查询选项               |
| `EntityMetadataTreeFeatures`                                                                    | `features.tree` 的元数据类型 |
| `FindDescendantsQuery` / `FindAncestorsQuery` / `CountDescendantsQuery` / `CountAncestorsQuery` | 四个查询 task 类型           |

```diff
- import { TreeAdjacencyListEntityBase, TreeEntity } from '@aiao/rxdb';
+ import { TreeAdjacencyListEntityBase, TreeEntity } from '@aiao/rxdb-plugin-tree';
```

`EntityMetadataFeatures.tree` 由插件通过 `declare module '@aiao/rxdb'` 增广而来：没装插件时写 `features: { tree: ... }` 是**编译错误**，而不是运行期被静默忽略。

### 框架包 → 框架插件包

三框架的四个树 hook 不再由 `@aiao/rxdb-{framework}` 导出：

| 原来                               | 现在                             |
| :--------------------------------- | :------------------------------- |
| `@aiao/rxdb-angular` 的四个树 hook | `@aiao/rxdb-plugin-tree-angular` |
| `@aiao/rxdb-react` 的四个树 hook   | `@aiao/rxdb-plugin-tree-react`   |
| `@aiao/rxdb-vue` 的四个树 hook     | `@aiao/rxdb-plugin-tree-vue`     |

```diff
- import { useFindDescendants } from '@aiao/rxdb-react';
+ import { useFindDescendants } from '@aiao/rxdb-plugin-tree-react';
```

四个 hook（`useFindDescendants` / `useCountDescendants` / `useFindAncestors` / `useCountAncestors`）**名字、参数、返回形状全部未变**，三端仍然对称——只有 import 来源变了。

## 4. 核心公开了 merge 原语

树的增量 merge 是真增量（不像图查询一律回 SQL 刷新），搬进插件要求核心把 merge 引擎的几个内部原语公开出来。它们进了 API 基线，此后受兼容承诺约束：

| 符号                                              | 用途                             |
| :------------------------------------------------ | :------------------------------- |
| `prepareIncrementalUpdate`                        | 把一批更新事件备好成增量输入     |
| `UpdateClassification` / `UpdateDataCache`        | 分类结果与更新前后快照的取用入口 |
| `applyExternalEntityUpdate`                       | 把外部更新落到已有结果上         |
| `getEntityId`                                     | 实体标识                         |
| `isStaleEntityEvent` / `isStaleEntityRemoveEvent` | 过期事件识别（前置守卫）         |

`classifyUpdates` 与 `invalidateEntityFingerprint` **不在**这份清单里：它们是
`prepareIncrementalUpdate` / `applyExternalEntityUpdate` 内部的装配细节，没有进 API 基线，
也由 `incremental-merge-surface.spec.ts` 钉死为「只该留在核心内部」。插件拿到的是
`prepareIncrementalUpdate` 返回的 `UpdateClassification`，不必自己调分类器。

第三方插件要实现自己的增量 merge，用的就是这一组。

## 5. 代码生成器要显式声明树生成器

用 CLI（`rxdb-client-generator`）或 Vite 插件生成客户端代码、且实体上带 `@TreeEntity` 的项目，
必须在配置里声明树的仓储生成器：

```diff
  // rxdb.config.ts
  export default [
    {
      entities: [path.join(__dirname, 'entities', '*.ts')],
      outDir: path.join(__dirname, 'dist', 'entities'),
+     repositoryGenerators: ['@aiao/rxdb-plugin-tree/generator#TreeRepositoryGenerator'],
      relationQueryDeep: 10
    }
  ];
```

原因和 §2 的 `use()` 是同一件：`TreeRepository` 的**构建期**代码生成器原先硬编码在
`@aiao/rxdb-client-generator` 里，生成器包因此反向依赖插件包。现在它随插件走，
由 `repositoryGenerators` 按 `<模块>#<导出名>` 装载（相对路径也可以，按配置文件所在目录解析）。

漏了这一行是 **fail-closed**，不会静默少生成：

```
No repository generator registered for "TreeRepository" (entity Menu). Add "@aiao/rxdb-plugin-tree/generator#TreeRepositoryGenerator" to `repositoryGenerators` in the generator config.
```

`@GraphEntity` 同理，声明 `'@aiao/rxdb-plugin-graph/generator#GraphRepositoryGenerator'`。
只用 `@Entity` 的项目不受影响——默认的 `Repository` 生成器仍内置。

如果你是在代码里直接用 `RxDBClientGenerator`（而不是走 CLI），改成：

```diff
  import { RxDBClientGenerator } from '@aiao/rxdb-client-generator';
+ import { TreeRepositoryGenerator } from '@aiao/rxdb-plugin-tree/generator';

  const generator = new RxDBClientGenerator();
+ generator.registerRepositoryGenerator(new TreeRepositoryGenerator());
  generator.addEntity(Menu);
  generator.exec();
```

`/generator` 子路径是构建期专用入口：它不引装饰器也不引 rxjs，和运行时入口互不牵连。
生成产物**一字未变**——`TreeAdjacencyListEntityBase` 的 import 来源、四个静态方法的重载、
`XxxTreeRuleGroup` 都和搬家前逐字节相同。

## 6. 适配器不受影响

PGlite / SQLite / SQLite-WASM / sqliteai / Supabase / wa-sqlite 六个适配器的**公开 API 一字未动**：`case 'TreeRepository'` 的字符串分发保持原样，`PGliteTreeRepository` / `SqliteTreeRepository` / `SupabaseTreeRepository` 的类名与签名不变，只把类型来源改到了本包。照着旧文档写的适配器代码不需要改。

## 参考

- [树结构插件](../plugins/rxdb-plugin-tree/README.md)：完整用法与 API
- [树结构建模](../model-definition/structure-tree.md)
- [插件作用域契约迁移](./plugin-scope.md)：`install(scope)` 契约与本插件 `lifecycle: 'scoped'` 的含义
- [版本与 API 稳定性策略](../versioning.md)
