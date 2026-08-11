# GraphEntity 与图结构建模

包入口说明见 [@aiao/rxdb-plugin-graph](./README.md)。

图结构用于“节点 + 边”场景，例如关注关系、社交图、依赖图、路径搜索。

当前实现分两层：

- 普通多对多关系：适合简单连接
- `@GraphEntity`：适合真正需要邻居、路径、边属性、边权重的图场景

## 这不是核心包功能

图实体相关 API 来自独立包 `@aiao/rxdb-plugin-graph`，不是 `@aiao/rxdb` 本体导出。

最少要有这几个导入：

```ts
import { PropertyType } from '@aiao/rxdb';
import { GraphEntity, GraphEntityBase } from '@aiao/rxdb-plugin-graph';
```

如果你要真的跑图查询，还需要把图插件接入到 `RxDB` 运行时。

## 定义图实体

```ts
import { PropertyType } from '@aiao/rxdb';
import { GraphEntity, GraphEntityBase } from '@aiao/rxdb-plugin-graph';

@GraphEntity({
  name: 'Person',
  properties: [
    { name: 'name', type: PropertyType.string },
    { name: 'city', type: PropertyType.string, nullable: true }
  ],
  features: {
    graph: {
      type: 'directed-graph',
      weight: true,
      properties: [
        { name: 'category', type: PropertyType.string },
        { name: 'since', type: PropertyType.date }
      ]
    }
  }
})
export class Person extends GraphEntityBase {}
```

## `features.graph` 的真实字段

当前代码支持的是：

- `type?: 'undirected-graph' | 'directed-graph'`
- `weight?: boolean`
- `properties?: KeyValuePropertyMetadata[]`

也就是说：

- 没有 `graphWeight`
- 没有 `graphProperties: true`

边属性不是一个布尔开关，而是一组明确的结构定义。

## 自动生成的边实体

`@GraphEntity` 会通过仓库生成器创建边实体，边表名是：

- `${节点实体名}_edges`

例如 `Person` 会生成 `Person_edges`。

在具体适配器里，真实数据库表名还会带上命名空间前缀，例如 SQLite 里常见的是：

- `public$Person_edges`

边表字段是否包含 `weight`、`properties`，取决于 `features.graph` 配置。

## 图查询 API

`GraphEntityBase` 会提供两类静态方法：

- 查询方法，返回 `Observable`：`findNeighbors`、`countNeighbors`、`findPaths`
- 写方法，返回 `Promise`：`addEdge`、`removeEdge`

### 查询邻居

```ts
import { firstValueFrom } from 'rxjs';

const neighbors = await firstValueFrom(
  Person.findNeighbors({
    entityId: alice.id,
    direction: 'out',
    level: 2,
    edgeWhere: {
      weight: { min: 5 },
      properties: { category: 'friend' }
    }
  })
);
```

结果结构是：

```ts
{
  node,
  edge: {
    sourceId,
    targetId,
    direction,
    weight,
    properties
  },
  level
}
```

### 统计邻居数量

```ts
const count = await firstValueFrom(
  Person.countNeighbors({
    entityId: alice.id,
    direction: 'both',
    level: 1
  })
);
```

### 查询路径

```ts
const paths = await firstValueFrom(
  Person.findPaths({
    fromId: alice.id,
    toId: bob.id,
    direction: 'out',
    maxDepth: 5
  })
);
```

路径结果包含：

- `nodes`
- `edges`
- `length`
- `totalWeight?`

## 查询参数边界

### `findNeighbors`

- `entityId`：必填
- `direction`：默认 `'both'`
- `level`：默认 `1`，实现中会限制在 `1-10`
- `where`：节点过滤条件
- `edgeWhere`：边过滤条件

### `findPaths`

- `fromId` / `toId`：必填
- `direction`：默认 `'both'`
- `maxDepth`：默认 `5`，实现中会限制最大深度
- `where`：路径中节点过滤
- `edgeWhere`：路径中边过滤

## 边操作

这两个方法返回 `Promise`，因为它们是写操作：

```ts
await Person.addEdge(alice, bob, 8, {
  category: 'colleague',
  since: new Date('2024-01-01')
});

await Person.removeEdge(alice, bob);
```

## 什么时候该用 GraphEntity

用普通多对多就够的时候：

- 只关心“有没有关联”
- 不关心路径、方向、跳数、边属性

该上 `@GraphEntity` 的时候：

- 需要查询 1 跳 / 2 跳 / N 跳邻居
- 需要路径搜索
- 需要边权重
- 需要边属性过滤
