# Entity properties

A property definition describes what a column stores, whether it can be null, whether it is unique, whether it has a default value, and what the database column is called.

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
      displayName: 'Example of a snake_case database column name'
    }
  ]
})
export class Product extends EntityBase {}
```

## Fields provided by EntityBase

Inheriting `EntityBase` gives you these fields without declaring them again:

- `id`: a `uuid` primary key, generated automatically by default
- `createdAt`: a `date`, defaulting to `() => new Date()`
- `updatedAt`: a `date`, defaulting to `() => new Date()`
- `createdBy`: a nullable string
- `updatedBy`: a nullable string

## Supported property types

| Type          | Description           | Key notes                                                                     |
| ------------- | --------------------- | ----------------------------------------------------------------------------- |
| `uuid`        | UUID string           | Can set `primary: true`                                                       |
| `string`      | String                | Can set `primary: true`                                                       |
| `enum`        | Enum string           | Must also provide `enum: readonly string[]`                                   |
| `number`      | Number                | Supports default values                                                       |
| `integer`     | Integer               | Can set `primary: true`                                                       |
| `bigint`      | 64-bit signed integer | Uses `bigint` at runtime; can set `primary: true`                             |
| `boolean`     | Boolean               | Supports default values                                                       |
| `date`        | Date                  | The default can be a `Date`, `() => Date`, or `CURRENT_TIMESTAMP`             |
| `binary`      | Binary bytes          | Uses `Uint8Array` at runtime                                                  |
| `stringArray` | Array of strings      | Good for tags and similar cases                                               |
| `numberArray` | Array of numbers      | Good for simple numeric collections                                           |
| `keyValue`    | Flat key-value object | No nesting, no arrays                                                         |
| `json`        | Arbitrary JSON        | Supports nested objects and arrays; not used for structured search by default |

## Common property options

These options come from `IEntityObject`, `ISortable`, and the concrete property type definitions in the current code:

| Option        | Description                                                                    |
| ------------- | ------------------------------------------------------------------------------ |
| `name`        | Field name; the runtime property name                                          |
| `columnName`  | Database column name; defaults to `name` when omitted                          |
| `displayName` | Display name                                                                   |
| `unique`      | Unique constraint; prefer it for single-field uniqueness                       |
| `readonly`    | Skip this field on updates                                                     |
| `nullable`    | Allow `NULL` at the database layer                                             |
| `required`    | Required at the frontend validation layer; not the same as database `NOT NULL` |
| `sortable`    | Allow sorting at the query layer                                               |
| `default`     | Default value; supports a constant or a function                               |
| `primary`     | Marks the primary key; supported only by some types                            |

### The difference between `required` and `nullable`

- `required: true`: leans toward form and input validation; an empty string or an empty array is also treated as invalid
- `nullable: false`: leans toward storage constraints; it means the database column must not be `NULL`

You can use both options together or just one of them; do not use them interchangeably.

## Common patterns

### 1. Separating the database column name from the code field name

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

`keyValue` is a flat key-value object; its inner keys need their own structure declarations:

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

If you need nested objects, arrays, or a more flexible structure, use `json` instead.

### 5. `bigint` and `binary`

`bigint` accepts only JavaScript `bigint`, with a stored range from `-2^63` to `2^63 - 1`. Do not pass a `number` or a string; even if the value looks the same, the adapter rejects the implicit conversion before running the SQL.

```ts
{
  name: 'sequence',
  type: PropertyType.bigint,
  default: 0n,
  sortable: true
}
```

`binary` accepts only `Uint8Array`. Saving `source.subarray(start, end)` processes only the bytes inside that view; it does not expand to the whole backing buffer. Default values and persistence boundaries also copy the bytes, so multiple entities or callers never share the same mutable array.

```ts
{
  name: 'payload',
  type: PropertyType.binary,
  default: () => new Uint8Array()
}
```

In-place mutation of a `Uint8Array` does not trigger entity change tracking. After changing the bytes, reassign the value and then call `save()`:

```ts
const nextPayload = new Uint8Array(entity.payload);
nextPayload[0] = 0xff;
entity.payload = nextPayload;
await entity.save();
```

`binary` does not support primary keys, relation foreign keys, range comparisons, `LIKE`, or sorting. When you need these capabilities, keep queryable scalar metadata separately.

## Computed properties

The current code also supports `computedProperties`. These fields are:

- Read-only
- Not written to the database directly
- Provided by a feature or by runtime logic

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
- For dynamic structures, decide between `keyValue` and `json` first; do not mix them
- Enable `sortable` only on fields that need sorting
