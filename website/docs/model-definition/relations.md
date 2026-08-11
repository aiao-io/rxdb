# 实体关系

关系定义决定两件事：

1. 元数据层如何理解两个实体之间的连接。
2. 运行时要给实例注入哪些外键字段和 `name$` 关系访问器。

当前代码支持四种关系：

- `RelationKind.ONE_TO_ONE`
- `RelationKind.ONE_TO_MANY`
- `RelationKind.MANY_TO_ONE`
- `RelationKind.MANY_TO_MANY`

## 先记住三个规则

### 1. `mappedProperty` 不是可选装饰

当前实现里，四种关系都要求写 `mappedProperty`。它表示“对方实体里与我配对的那个关系名”。

### 2. 只有拥有外键的一侧才会生成 `nameId`

当前代码里，自动生成外键字段的只有：

- `ONE_TO_ONE`
- `MANY_TO_ONE`

默认外键名是 `nameId`，数据库列名默认也一样；如果要改数据库列名，用 `columnName`。

### 3. 关系改动不是自动落库

`owner$.set(user)`、`categories$.add(category)` 这些调用只是在当前实体状态上记录关系变更。最终仍然要 `save()` 或通过 `entityManager.save()` 持久化。

## 一对一

来自当前仓库真实示例的简化版：

```ts
import { Entity, EntityBase, PropertyType, RelationKind } from '@aiao/rxdb';

@Entity({
  name: 'User',
  namespace: 'shop',
  tableName: 'user',
  properties: [{ name: 'name', type: PropertyType.string }],
  relations: [
    {
      name: 'idCard',
      kind: RelationKind.ONE_TO_ONE,
      mappedEntity: 'IdCard',
      mappedProperty: 'owner',
      nullable: true
    }
  ]
})
export class User extends EntityBase {}

@Entity({
  name: 'IdCard',
  namespace: 'shop',
  tableName: 'id_card',
  properties: [{ name: 'code', type: PropertyType.string, unique: true }],
  relations: [
    {
      name: 'owner',
      kind: RelationKind.ONE_TO_ONE,
      mappedEntity: 'User',
      mappedProperty: 'idCard',
      nullable: false
    }
  ]
})
export class IdCard extends EntityBase {}
```

一对一这一侧会自动得到：

- `idCardId` / `ownerId`
- `idCard$` / `owner$`

常用选项：

- `mappedEntity`
- `mappedProperty`
- `mappedNamespace`
- `nullable`
- `unique`
- `columnName`
- `onDelete` / `onUpdate`

## 一对多 / 多对一

这组关系通常一起出现。下面的结构直接对应当前仓库里的 `User`、`Order`、`OrderItem` 示例：

```ts
import { Entity, EntityBase, PropertyType, RelationKind } from '@aiao/rxdb';

@Entity({
  name: 'User',
  namespace: 'shop',
  tableName: 'user',
  properties: [{ name: 'name', type: PropertyType.string }],
  relations: [
    {
      name: 'orders',
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'Order',
      mappedProperty: 'owner'
    }
  ]
})
export class User extends EntityBase {}

@Entity({
  name: 'Order',
  namespace: 'shop',
  tableName: 'order',
  properties: [
    { name: 'number', type: PropertyType.string, unique: true },
    { name: 'amount', type: PropertyType.number }
  ],
  relations: [
    {
      name: 'owner',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'User',
      mappedProperty: 'orders'
    },
    {
      name: 'items',
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'OrderItem',
      mappedProperty: 'order'
    }
  ]
})
export class Order extends EntityBase {}
```

这组关系里：

- `ONE_TO_MANY` 这一侧只有 `orders$` / `items$`
- `MANY_TO_ONE` 这一侧同时有 `ownerId` / `orderId` 和 `owner$` / `order$`

`MANY_TO_ONE` 额外常用选项：

- `nullable`
- `columnName`
- `unique`
- `mappedNamespace`

## 多对多

真实示例可以看仓库里的 `OrderItem.categories` 和 `Category.orderItems`。

```ts
import { Entity, EntityBase, RelationKind } from '@aiao/rxdb';

@Entity({
  name: 'OrderItem',
  namespace: 'shop',
  relations: [
    {
      name: 'categories',
      kind: RelationKind.MANY_TO_MANY,
      mappedEntity: 'Category',
      mappedProperty: 'orderItems'
    }
  ]
})
export class OrderItem extends EntityBase {}

@Entity({
  name: 'Category',
  namespace: 'shop',
  relations: [
    {
      name: 'orderItems',
      kind: RelationKind.MANY_TO_MANY,
      mappedEntity: 'OrderItem',
      mappedProperty: 'categories'
    }
  ]
})
export class Category extends EntityBase {}
```

框架会在 `SchemaManager.init()` 阶段自动生成连接实体：

- 名称：两个实体名按字母序拼接，例如 `Category_OrderItem`
- 命名空间：两个命名空间去重后按字母序拼接

如果你确实需要自定义连接实体，也可以用 `junctionEntityType` 指定。

## 关系访问 API

### 单值关系：`RelationEntityObservable`

适用于 `ONE_TO_ONE`、`MANY_TO_ONE`：

```ts
import { firstValueFrom } from 'rxjs';

order.owner$.set(user);
await order.save();

const owner = await firstValueFrom(order.owner$);

order.owner$.remove();
await order.save();
```

### 集合关系：`RelationEntitiesObservable`

适用于 `ONE_TO_MANY`、`MANY_TO_MANY`：

```ts
import { firstValueFrom } from 'rxjs';

orderItem.categories$.add(category);
await orderItem.save();

const categories = await firstValueFrom(orderItem.categories$);
const count = await firstValueFrom(orderItem.categories$.count$);

orderItem.categories$.remove(category);
await orderItem.save();
```

## 跨命名空间关系

代码支持通过 `mappedNamespace` 显式引用其他命名空间里的实体：

```ts
{
  name: 'customer',
  kind: RelationKind.MANY_TO_ONE,
  mappedEntity: 'Customer',
  mappedNamespace: 'crm',
  mappedProperty: 'orders'
}
```

## 建议

- 关系两端都显式写出来，不要只写一边
- 需要外键列名兼容旧库时，用 `columnName`
- 多对多只负责连接，不代表删除一端时要删除另一端实体
- 级联删除语义要单独检查，见下一篇 [级联操作](./cascade.md)
