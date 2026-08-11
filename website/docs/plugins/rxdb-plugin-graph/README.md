# @aiao/rxdb-plugin-graph

`@aiao/rxdb-plugin-graph` 为 RxDB 提供图结构建模、边关系存储，以及邻居与路径查询能力。

它适合这些场景：

- 社交关系图
- 依赖关系图
- 推荐网络
- 任意需要“节点 + 边 + 路径搜索”的业务模型

## 提供什么

- `@GraphEntity()`：声明图实体
- `GraphEntityBase`：图实体基类
- `addEdge()` / `removeEdge()`：边写入接口
- `findNeighbors()` / `countNeighbors()` / `findPaths()`：图查询接口

## 安装

```bash npm2yarn
npm install @aiao/rxdb @aiao/rxdb-plugin-graph
```

## 什么时候该用它

- 只需要普通关联：优先用核心包里的关系定义
- 需要邻居查询、路径搜索、边权重、边属性：再接入 `@aiao/rxdb-plugin-graph`

## 推荐阅读

- [GraphEntity 与图结构建模](./graph-entity.md)
- [邻居查询](../../model-query/findNeighbors.md)
- [路径查询](../../model-query/findPaths.md)
- [API 文档](../../api/README.md)
