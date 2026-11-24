# Relationship cascade defaults

This page explains how the framework fills in default values. It is not business design advice.

When a relation does not declare `onDelete` / `onUpdate` explicitly, the framework fills in defaults during metadata conversion based on the relation kind and `nullable`.

## Default table

| Relation kind  | Condition         | `onDelete` default | `onUpdate` default |
| -------------- | ----------------- | ------------------ | ------------------ |
| `ONE_TO_ONE`   | -                 | `CASCADE`          | `RESTRICT`         |
| `ONE_TO_MANY`  | -                 | `CASCADE`          | `RESTRICT`         |
| `MANY_TO_ONE`  | `nullable: false` | `RESTRICT`         | `RESTRICT`         |
| `MANY_TO_ONE`  | `nullable: true`  | `SET_NULL`         | `RESTRICT`         |
| `MANY_TO_MANY` | -                 | `RESTRICT`         | `RESTRICT`         |

## The most commonly misunderstood point

`ONE_TO_MANY` defaults to `CASCADE`, but the real database foreign key usually sits on the `MANY_TO_ONE` side.

So for a pair of relations like this:

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

and this:

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

If you do not override anything, the default that matters when you actually delete an `Order` is the one on the `OrderItem.order` side, and that side defaults to `RESTRICT`. The tests in this repository verify this: by default, deleting a parent entity that has children is blocked.

## What each relation actually means

### `ONE_TO_ONE`

- Defaults to `onDelete: CASCADE`
- Defaults to `onUpdate: RESTRICT`

This fits a one-to-one with a strong dependency, but still check explicitly which side the foreign key actually lands on.

### `ONE_TO_MANY`

- Defaults to `onDelete: CASCADE`
- Defaults to `onUpdate: RESTRICT`

This is more like "the collection side's default intent" than the only source of the final database behavior.

### `MANY_TO_ONE`

#### Not nullable

```ts
{
  nullable: false,
  onDelete: OnDeleteAction.RESTRICT,
  onUpdate: OnUpdateAction.RESTRICT
}
```

#### Nullable

```ts
{
  nullable: true,
  onDelete: OnDeleteAction.SET_NULL,
  onUpdate: OnUpdateAction.RESTRICT
}
```

This is the side most worth checking yourself, because it usually decides the database foreign key behavior directly.

### `MANY_TO_MANY`

The relation metadata itself defaults to:

```ts
{
  onDelete: OnDeleteAction.RESTRICT,
  onUpdate: OnUpdateAction.RESTRICT
}
```

But there is one key detail:

When the framework auto-generates the join entity, it sets both `MANY_TO_ONE` foreign keys on that entity to `CASCADE`. This means:

- Deleting an entity on one end automatically cleans up the join table records
- The entity on the other end itself is not automatically deleted

So many-to-many is not a model where you must delete the join table records manually before you can delete an entity. At least on the auto-generated join entity path, the join records are cleaned up automatically.

## The special case of tree structures

The `parent` relation in `TreeAdjacencyListEntityBase` explicitly declares:

```ts
onDelete: OnDeleteAction.CASCADE;
```

So tree structures default to deleting a parent's children along with it. This is not the general default for `MANY_TO_ONE(nullable: true)`; it is a deliberate override by the tree base class.

## Why `onUpdate` should almost always stay `RESTRICT`

The current default implementation converges `onUpdate` to `RESTRICT` for every relation. The reasons are direct:

- Primary keys should normally not change
- Changing a primary key ripples through every foreign key
- It is expensive and risky

If your business truly needs to update a primary key, treat it as a deliberate and rare design decision.

## Recommended pattern

Whenever a relation's delete semantics matter to your business, declare them explicitly. Do not rely on the defaults happening to fit.

For example, with orders and order items, if you want deleting an order to delete its items too, spell out the side that actually holds the foreign key:

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

## Practical advice

- Defaults are a starting point, not a design conclusion
- Check first which side the foreign key actually lands on
- For many-to-many, "delete the join records" and "delete the entity on the other end" are two different things
- Tree cascade behavior comes from a base class override; do not extrapolate it to an ordinary nullable many-to-one
