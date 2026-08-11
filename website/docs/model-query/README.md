# 模型查询

本章说明实体静态查询方法怎么选、返回什么,以及各自适合的场景。

## 先记住两条

- 普通查询、树查询、图查询的静态方法都返回 `Observable`
- 只拿当前快照时,配套写法是 `firstValueFrom()`

如果直接拿 `Repository` / `GraphRepository` 实例调用,底层方法可能返回 `Promise`。

## 按场景选入口

| 场景                | 推荐方法                                         |
| ------------------- | ------------------------------------------------ |
| 已知主键            | `get`                                            |
| 条件查一条,允许为空 | `findOne`                                        |
| 条件查一条,必须存在 | `findOneOrFail`                                  |
| 常规列表分页        | `find`                                           |
| 全量列表            | `findAll`                                        |
| 无限滚动 / 游标分页 | `findByCursor`                                   |
| 只关心数量          | `count`                                          |
| 树结构              | `findDescendants` / `findAncestors` / `count*`   |
| 图结构              | `findNeighbors` / `countNeighbors` / `findPaths` |

## 基础查询

- [get](./get.md)
- [find](./find.md)
- [findAll](./findAll.md)
- [findOne](./findOne.md)
- [findOneOrFail](./findOneOrFail.md)
- [findByCursor](./findByCursor.md)
- [count](./count.md)

## 树形查询

- [findDescendants](./findDescendants.md)
- [findAncestors](./findAncestors.md)
- [countDescendants](./countDescendants.md)
- [countAncestors](./countAncestors.md)

## 图查询

- [findNeighbors](./findNeighbors.md)
- [countNeighbors](./countNeighbors.md)
- [findPaths](./findPaths.md)

## 规则与原理

- [operators](./operators.md)
- [exists-operator](./exists-operator.md)
- [query-realtime](./query-realtime.md)
