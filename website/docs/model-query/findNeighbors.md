# findNeighbors

`findNeighbors` 用于图结构的邻居查询。实体静态方法分两套：`findNeighbors` 返回 `Promise`，直接 `await` 拿一次结果；`findNeighbors$` 返回 `Observable`，图结构变化时推送新结果。

## 图关系图

```mermaid
erDiagram
    PERSON ||--o{ PERSON_EDGES : source
    PERSON ||--o{ PERSON_EDGES : target
```

## 签名

```ts
findNeighbors(options: FindNeighborsOptions<T>): Promise<GraphQueryResult<NeighborResult<T>>>
findNeighbors$(options: FindNeighborsOptions<T>): Observable<GraphQueryResult<NeighborResult<T>>>
```

## 查询选项

| 选项        | 说明                                     |
| ----------- | ---------------------------------------- |
| `entityId`  | 起始节点 ID，必填                        |
| `direction` | `'in' \| 'out' \| 'both'`，默认 `'both'` |
| `level`     | 最大跳数，默认 `1`                       |
| `where`     | 节点过滤条件                             |
| `edgeWhere` | 边过滤条件                               |

## level 归一化

- 默认 `1`
- `level: 0` 保留原值：不查询任何邻居（`findNeighbors` 返回空数组，`countNeighbors` 返回 `0`）
- 小于 `0` 会被规范化为 `1`
- 大于 `100` 会被限制为 `100`

## 返回语义

- 结果不包含起始节点本身
- 结果里每一项都包含 `node`、`edge`、`level`
- 同一节点通过多条路径可达时，会按较短路径收敛结果

## 基础用法

```ts
const neighbors = await Person.findNeighbors({
  entityId: alice.id,
  direction: 'out',
  level: 2
});
```

## 持续订阅

```ts
const subscription = Person.findNeighbors$({ entityId: alice.id, level: 1 }).subscribe(neighbors => {
  console.log(neighbors.length);
});
```

## 权重和属性过滤

```ts
const importantNeighbors = await Person.findNeighbors({
  entityId: alice.id,
  level: 1,
  edgeWhere: {
    weight: { min: 5 },
    properties: { category: 'friend' }
  }
});
```

## 参考

- [countNeighbors](./countNeighbors.md)
- [findPaths](./findPaths.md)
- [图结构定义](../plugins/rxdb-plugin-graph/graph-entity.md)
