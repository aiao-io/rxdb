# Entity indexes

Index configuration is simple and clear. The current code supports two ways to declare indexes:

- Single-field uniqueness: write `unique: true` directly on the property
- Multi-field index or multi-field uniqueness: declare it in the entity's `indexes`

## Single-field uniqueness

Single-field uniqueness needs no separate `indexes` entry:

```ts
{
  name: 'number',
  type: PropertyType.string,
  unique: true
}
```

This is more concise than declaring a separate single-field `indexes` entry.

## Composite indexes

```ts
import { Entity, EntityBase, PropertyType } from '@aiao/rxdb';

@Entity({
  name: 'Order',
  properties: [
    { name: 'storeId', type: PropertyType.uuid },
    { name: 'buyerId', type: PropertyType.uuid },
    { name: 'number', type: PropertyType.string }
  ],
  indexes: [
    {
      name: 'idx_order_store_buyer',
      properties: ['storeId', 'buyerId']
    },
    {
      name: 'uk_order_store_number',
      unique: true,
      properties: ['storeId', 'number']
    }
  ]
})
export class Order extends EntityBase {}
```

## Index options

The core fields that `EntityIndexMetadataOptions` currently supports are:

- `name`: the index name
- `displayName`: a display name, optional
- `unique`: whether the index enforces uniqueness
- `properties`: the array of fields

The most important part is the order of `properties`. A composite index is not a set; it is an ordered prefix of columns.

A unique index can also take `where`, which applies it only to rows that satisfy the condition (partial uniqueness). See [Storage constraints](/model-definition/constraints.md#partial-uniqueness).

## When to create an index

- When a field will be queried frequently with exact matches
- When a group of fields is used together as filter conditions
- When a group of fields must be unique together

## When not to create an index

- Fields queried only occasionally
- Fields written frequently but almost never queried
- Defining a redundant composite index when single-field uniqueness is enough

## Naming conventions

The current code does not enforce a naming convention, but keeping one is recommended:

- Regular index: `idx_{entity}_{fields}`
- Unique index: `uk_{entity}_{fields}`

For example:

- `idx_order_store_buyer`
- `uk_order_store_number`

## Recommendations

- Prefer declaring single-field uniqueness on the property
- Use `indexes` for multi-field constraints
- Order `properties` by the most common query pattern
- Cross-table constraints are not the job of an index; handle them in the business layer or the relation constraint layer
- Declare per-row value rules, partial uniqueness, and non-overlapping ranges with [Storage constraints](/model-definition/constraints.md) instead of writing them only in repository methods
