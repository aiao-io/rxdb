# Entity relations

A relation definition determines two things:

1. How the metadata layer understands the connection between two entities.
2. Which foreign key fields and `name$` relation accessors are injected into instances at runtime.

The current code supports four relation kinds:

- `RelationKind.ONE_TO_ONE`
- `RelationKind.ONE_TO_MANY`
- `RelationKind.MANY_TO_ONE`
- `RelationKind.MANY_TO_MANY`

## Three rules to remember first

### 1. `mappedProperty` is not optional

In the current implementation, all four relation kinds require `mappedProperty`. It names the relation on the other entity that pairs with this one.

### 2. Only the foreign key side generates `nameId`

In the current code, foreign key fields are generated only for:

- `ONE_TO_ONE`
- `MANY_TO_ONE`

The default foreign key name is `nameId`, and the database column name defaults to the same; use `columnName` to change the database column name.

### 3. Relation changes are not persisted automatically

Calls like `owner$.set(user)` and `categories$.add(category)` only record the relation change on the current entity's state. You still have to persist with `save()` or through `entityManager.save()`.

## One-to-one

A simplified version of a real example from the repository:

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

Each one-to-one side automatically gets:

- `idCardId` / `ownerId`
- `idCard$` / `owner$`

Common options:

- `mappedEntity`
- `mappedProperty`
- `mappedNamespace`
- `nullable`
- `unique`
- `columnName`
- `onDelete` / `onUpdate`

## One-to-many / many-to-one

These two kinds usually appear together. The structure below matches the `User`, `Order`, and `OrderItem` examples in the repository:

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

In this pair of relations:

- The `ONE_TO_MANY` side only gets `orders$` / `items$`
- The `MANY_TO_ONE` side gets both `ownerId` / `orderId` and `owner$` / `order$`

Additional common options for `MANY_TO_ONE`:

- `nullable`
- `columnName`
- `unique`
- `mappedNamespace`

## Many-to-many

See `OrderItem.categories` and `Category.orderItems` in the repository for real examples.

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

The framework generates a junction entity automatically during `SchemaManager.init()`:

- Name: the two entity names joined in alphabetical order, for example `Category_OrderItem`
- Namespace: the two namespaces joined in alphabetical order after deduplication

If you genuinely need a custom junction entity, specify one with `junctionEntityType`.

## Relation access API

### Single-value relations: `RelationEntityObservable`

For `ONE_TO_ONE` and `MANY_TO_ONE`:

```ts
import { firstValueFrom } from 'rxjs';

order.owner$.set(user);
await order.save();

const owner = await firstValueFrom(order.owner$);

order.owner$.remove();
await order.save();
```

### Collection relations: `RelationEntitiesObservable`

For `ONE_TO_MANY` and `MANY_TO_MANY`:

```ts
import { firstValueFrom } from 'rxjs';

orderItem.categories$.add(category);
await orderItem.save();

const categories = await firstValueFrom(orderItem.categories$);
const count = await firstValueFrom(orderItem.categories$.count$);

orderItem.categories$.remove(category);
await orderItem.save();
```

## Cross-namespace relations

Use `mappedNamespace` to reference an entity in another namespace explicitly:

```ts
{
  name: 'customer',
  kind: RelationKind.MANY_TO_ONE,
  mappedEntity: 'Customer',
  mappedNamespace: 'crm',
  mappedProperty: 'orders'
}
```

## Recommendations

- Declare both ends of every relation explicitly; do not declare only one side.
- Use `columnName` when the foreign key column name must stay compatible with an existing database.
- A many-to-many relation only connects entities; deleting one end does not delete the entity at the other end.
- Check cascade delete semantics separately; see [Cascades](/model-definition/cascade.md) in the next page.
