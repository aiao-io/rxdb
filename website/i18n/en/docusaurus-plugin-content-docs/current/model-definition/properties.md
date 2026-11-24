# Entity properties

A property definition describes what a column stores, whether it can be null, whether it is unique, whether it has a default value, and what the database column is named.

```ts
import { Entity, EntityBase, PropertyType } from '@aiao/rxdb';

@Entity({
  name: 'Product',
  displayName: 'Product',
  properties: [
    {
      name: 'title',
      type: PropertyType.string,
      displayName: 'Title',
      required: true,
      sortable: true
    },
    {
      name: 'status',
      type: PropertyType.enum,
      enum: ['draft', 'published', 'archived'],
      default: 'draft'
    },
    {
      name: 'productName',
      columnName: 'product_name',
      type: PropertyType.string,
      displayName: 'Database snake_case column example'
    }
  ]
})
export class Product extends EntityBase {}
```

## Fields supplied by EntityBase

After extending `EntityBase`, you do not need to declare these fields again:

- `id`: `uuid` primary key, generated automatically by default
- `createdAt`: `date`, default `() => new Date()`
- `updatedAt`: `date`, default `() => new Date()`
- `createdBy`: nullable string
- `updatedBy`: nullable string

## Supported property types

| Type           | Description               | Key notes                                                        |
| -------------- | ------------------------- | ---------------------------------------------------------------- |
| `uuid`         | UUID string               | Can set `primary: true`                                          |
| `string`       | String                    | Can set `primary: true`                                          |
| `enum`         | Enum string               | Must also provide `enum: readonly string[]`                      |
| `number`       | Number                    | Supports a default value                                         |
| `integer`      | Integer                   | Can set `primary: true`                                          |
| `bigint`       | 64-bit signed integer     | Uses `bigint` at runtime, can set `primary: true`                |
| `boolean`      | Boolean                   | Supports a default value                                         |
| `date`         | Date                      | The default can be `Date`, `() => Date`, or `CURRENT_TIMESTAMP`  |
| `binary`       | Binary bytes              | Uses `Uint8Array` at runtime                                     |
| `stringArray`  | Array of strings          | Good for tags and similar cases                                  |
| `numberArray`  | Array of numbers          | Good for simple numeric collections                              |
| `keyValue`     | Flat key-value object     | No nesting, no arrays                                            |
| `json`         | Arbitrary JSON            | Supports nested objects and arrays; not used for structured search by default |

## Common property options

These options come from `IEntityObject`, `ISortable`, and the concrete property type definitions in the current code:

| Option        | Description                                                             |
| ------------- | ----------------------------------------------------------------------- |
| `name`        | Field name, the runtime property name                                   |
| `columnName`  | Database column name, defaults to `name` when omitted                   |
| `displayName` | Display name                                                            |
| `unique`      | Unique constraint, prefer it for single-field uniqueness                |
| `readonly`    | Ignore this field on update                                             |
| `nullable`    | Allow `NULL` at the database layer                                      |
| `required`    | Required at the frontend validation layer, not the same as `NOT NULL`   |
| `sortable`    | Allow sorting at the query layer                                        |
| `default`     | Default value, accepts a constant or a function                         |
| `primary`     | Marks a primary key, only supported by some types                       |

### The difference between `required` and `nullable`

- `required: true`: leans toward form/input validation, empty strings and empty arrays are also treated as invalid
- `nullable: false`: leans toward the storage constraint, means the database column does not allow `NULL`

You can use both options together or either one alone. Do not use them interchangeably.

## Common patterns

### 1. Separate the database column name from the code field name

```ts
{
  name: 'productName',
  columnName: 'product_name',
  type: PropertyType.string,
  displayName: 'Product name'
}
```

### 2. Enum fields

```ts
{
  name: 'status',
  type: PropertyType.enum,
  enum: ['draft', 'published', 'archived'],
  default: 'draft'
}
```

### 3. Function default values

```ts
{
  name: 'publishedAt',
  type: PropertyType.date,
  nullable: true,
  default: () => new Date()
}
```

### 4. The `keyValue` type

`keyValue` is a flat key-value object. Declare the structure of its inner keys separately:

```ts
{
  name: 'attrs',
  type: PropertyType.keyValue,
  properties: [
    { name: 'brand', type: PropertyType.string, required: true },
    { name: 'weight', type: PropertyType.number },
    { name: 'fragile', type: PropertyType.boolean, default: false }
  ]
}
```

If you need nested objects, arrays, or a freer structure, use `json` instead.

### 5. `bigint` and `binary`

`bigint` accepts only JavaScript `bigint` values. The stored range is `-2^63` to `2^63 - 1`. Do not pass a `number` or a string; even when the value looks the same, the adapter rejects the implicit conversion before executing SQL.

```ts
{
  name: 'sequence',
  type: PropertyType.bigint,
  default: 0n,
  sortable: true
}
```

`binary` accepts only `Uint8Array`. Saving `source.subarray(start, end)` processes only the bytes within the current view; it does not expand to the entire backing buffer. Default values and persistence boundaries also copy the bytes, so multiple entities or callers do not share the same mutable array.

```ts
{
  name: 'payload',
  type: PropertyType.binary,
  default: () => new Uint8Array()
}
```

In-place modification of a `Uint8Array` does not trigger entity change tracking. After modifying the bytes, reassign the value and then call `save()`:

```ts
const nextPayload = new Uint8Array(entity.payload);
nextPayload[0] = 0xff;
entity.payload = nextPayload;
await entity.save();
```

`binary` does not support primary keys, relation foreign keys, range comparison, LIKE, or sorting. When you need these capabilities, store queryable scalar metadata separately.

## Computed properties

The current code also supports `computedProperties`. These fields are:

- read-only
- not persisted to the database directly
- supplied by features or runtime logic

`hasChildren` in the tree structure base class is a real example.

```ts
computedProperties: [
  {
    name: 'hasChildren',
    type: PropertyType.boolean,
    readonly: true,
    nullable: true
  }
];
```

## Recommendations

- Use `unique: true` directly for single-field uniqueness
- Use `columnName` when you need to stay compatible with legacy database column names
- For dynamic structures, distinguish `keyValue` from `json`, do not mix them
- Enable `sortable` only for fields you need to sort by
