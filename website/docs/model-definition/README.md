# 模型定义

模型定义决定实体长什么样、怎么关联、怎么被查询。三条建模入口按场景选:

- `@Entity()` — 普通实体,来自 `@aiao/rxdb`
- `@TreeEntity()` — 树结构实体,来自 `@aiao/rxdb`
- `@GraphEntity()` — 图结构实体,来自 `@aiao/rxdb-plugin-graph`

日常业务最常用的是普通实体:

```ts
import { Entity, EntityBase, PropertyType } from '@aiao/rxdb';

@Entity({
  name: 'Todo',
  namespace: 'work',
  tableName: 'todo',
  displayName: '待办事项',
  properties: [
    { name: 'title', type: PropertyType.string, required: true },
    { name: 'completed', type: PropertyType.boolean, default: false },
    { name: 'dueDate', type: PropertyType.date, nullable: true }
  ]
})
export class Todo extends EntityBase {}
```

## `@Entity()` 常用字段

`EntityMetadataOptions` 里业务最常打交道的几项:

| 字段         | 说明                               |
| ------------ | ---------------------------------- |
| `name`       | 实体名                             |
| `namespace`  | 命名空间,默认 `public`             |
| `tableName`  | 数据库表名,不写时取 `name`         |
| `properties` | 字段定义                           |
| `relations`  | 关系定义                           |
| `indexes`    | 索引定义                           |
| `repository` | 仓库类型,普通实体默认 `Repository` |
| `features`   | 树、图等扩展特性                   |

## 自动得到的能力

继承 `EntityBase` 后,框架自动带上这些基础字段:

`id` · `createdAt` · `updatedAt` · `createdBy` · `updatedBy`

装饰器还会按元数据补出运行时能力:

- `ONE_TO_ONE` / `MANY_TO_ONE` 关系的外键,默认命名 `nameId`
- 关系访问属性,命名 `name$`
- 静态查询方法,如 `find`、`findOne`、`count`

## 先记住两个边界

1. 实体静态查询方法返回 `Observable`,不是 `Promise`
2. 图结构能力不在核心包里,用 `@GraphEntity` 需要额外装 `@aiao/rxdb-plugin-graph`

## 建模建议

- 普通业务实体优先 `@Entity`
- 有父子层级、要查祖先/后代时用 `@TreeEntity` + `TreeAdjacencyListEntityBase`
- 要查边、路径、邻居时用 `@GraphEntity` + `GraphEntityBase`
- 单字段唯一约束写在属性上,多字段约束用 `indexes`
- 关系两端都显式声明,别依赖"推断另一端"

## 继续阅读

- [属性定义](./properties.md)
- [关系定义](./relations.md)
- [索引定义](./indexes.md)
- [级联操作](./cascade.md)
- [树形结构](./structure-tree.md)
- [图结构(rxdb-plugin-graph)](../plugins/rxdb-plugin-graph/graph-entity.md)
