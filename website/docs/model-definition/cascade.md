# 关系级联默认值

本文档说明框架如何补默认值，不涉及业务设计建议。

当关系没有显式声明 `onDelete` / `onUpdate` 时，框架会在元数据转换阶段根据关系类型和 `nullable` 自动填充默认值。

## 默认表

| 关系类型       | 条件              | `onDelete` 默认值 | `onUpdate` 默认值 |
| -------------- | ----------------- | ----------------- | ----------------- |
| `ONE_TO_ONE`   | -                 | `CASCADE`         | `RESTRICT`        |
| `ONE_TO_MANY`  | -                 | `CASCADE`         | `RESTRICT`        |
| `MANY_TO_ONE`  | `nullable: false` | `RESTRICT`        | `RESTRICT`        |
| `MANY_TO_ONE`  | `nullable: true`  | `SET_NULL`        | `RESTRICT`        |
| `MANY_TO_MANY` | -                 | `RESTRICT`        | `RESTRICT`        |

## 最容易误解的一点

`ONE_TO_MANY` 默认是 `CASCADE`，但真正的数据库外键通常落在 `MANY_TO_ONE` 那一侧。

所以像下面这组关系：

```ts
relations: [
  {
    name: 'items',
    kind: RelationKind.ONE_TO_MANY,
    mappedEntity: 'OrderItem',
    mappedProperty: 'order'
  }
];
```

和：

```ts
relations: [
  {
    name: 'order',
    kind: RelationKind.MANY_TO_ONE,
    mappedEntity: 'Order',
    mappedProperty: 'items',
    nullable: false
  }
];
```

如果你没有额外覆写，那么实际删除 `Order` 时，更关键的是 `OrderItem.order` 这一侧的默认值，而它默认是 `RESTRICT`。当前仓库的测试也验证了这件事：默认情况下会阻止删除有子项的父实体。

## 各关系的实际含义

### `ONE_TO_ONE`

- 默认 `onDelete: CASCADE`
- 默认 `onUpdate: RESTRICT`

适合强依赖的一对一，但仍然建议明确检查外键到底落在哪一侧。

### `ONE_TO_MANY`

- 默认 `onDelete: CASCADE`
- 默认 `onUpdate: RESTRICT`

这更像“集合端的默认意图”，不是最终数据库行为的唯一来源。

### `MANY_TO_ONE`

#### 不可空

```ts
{
  nullable: false,
  onDelete: OnDeleteAction.RESTRICT,
  onUpdate: OnUpdateAction.RESTRICT
}
```

#### 可空

```ts
{
  nullable: true,
  onDelete: OnDeleteAction.SET_NULL,
  onUpdate: OnUpdateAction.RESTRICT
}
```

这是最值得你主动检查的一侧，因为它通常直接决定数据库外键行为。

### `MANY_TO_MANY`

关系元数据本身默认是：

```ts
{
  onDelete: OnDeleteAction.RESTRICT,
  onUpdate: OnUpdateAction.RESTRICT
}
```

但这里有个关键细节：

框架自动生成连接实体时，会把连接实体两侧的 `MANY_TO_ONE` 外键都设成 `CASCADE`。这意味着：

- 删除一端实体时，会自动清理连接表记录
- 不会自动删除另一端实体本身

所以，多对多不是“必须手动先删连接表才能删实体”的模型；至少在自动生成连接实体这条路径上，连接记录会被自动清掉。

## 树结构的特殊情况

`TreeAdjacencyListEntityBase` 里的 `parent` 关系显式写了：

```ts
onDelete: OnDeleteAction.CASCADE;
```

因此树结构默认就是“删父带子”。这不是 `MANY_TO_ONE(nullable: true)` 的通用默认值，而是树基类的主动覆写。

## 为什么 `onUpdate` 基本都应该保持 `RESTRICT`

当前默认实现把所有关系的 `onUpdate` 都收敛到 `RESTRICT`，原因很直接：

- 主键通常不该改
- 改主键会牵动所有外键
- 成本高，风险也高

如果业务确实需要更新主键，应作为一个明确且罕见的特殊设计决策。

## 推荐写法

只要关系删除语义对业务有影响，就应显式声明，不应依赖默认值恰好符合业务需求。

例如订单和订单项，若你想删订单时一并删订单项，应该把真正持有外键的那侧写清楚：

```ts
{
  name: 'order',
  kind: RelationKind.MANY_TO_ONE,
  mappedEntity: 'Order',
  mappedProperty: 'items',
  nullable: false,
  onDelete: OnDeleteAction.CASCADE,
  onUpdate: OnUpdateAction.RESTRICT
}
```

## 实践建议

- 默认值只是起点，不是设计结论
- 优先检查外键实际落在哪一侧
- 多对多要区分“删除连接记录”和“删除另一端实体”是两回事
- 树结构的级联行为来自基类覆写，不要拿它类推普通可空多对一
