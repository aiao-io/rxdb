# DateProperty

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:363](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L363)

Date-time property

## Remarks

Besides `Date` and generator functions, `default` also accepts the sentinel string `'CURRENT_TIMESTAMP'`,
which declares a **database-side DEFAULT at table creation** (materialized as `now()` in PGlite), not a string literal.
Use it when timestamps must be comparable across devices — client clocks differ.

Note that not all write paths let the database evaluate it: bulk inserts give every column explicitly and bypass the DB DEFAULT,
and the adapter swaps the sentinel for the client's current time right there (see `inserts_sql.ts`).
The sentinel **must not** appear in values read back — `new Date('CURRENT_TIMESTAMP')` is an Invalid Date.

## Extends

- `IEntityObject`
- `ISortable`

## Properties

### check? \{#check\}

```ts
check?: PropertyCheckRule;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:95](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L95)

Property-level CHECK constraint (syntactic sugar): a [PropertyCheckRule](../type-aliases/PropertyCheckRule.md) with `field` omitted, compiled into an entity-level CHECK named after the property, which participates in inheritance override by `name` the same way as entity-level `checks`.

#### Example

```typescript
properties: [{ name: 'qty', type: PropertyType.integer, check: { operator: '>', value: 0 } }]
```

#### Inherited from

`IEntityObject.check`

***

### columnName? \{#columnname\}

```ts
columnName?: string;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L37)

Column name in the database
Defaults to the `name` when omitted

#### Inherited from

`IEntityObject.columnName`

***

### default? \{#default\}

```ts
default?: Date | (() => Date) | "CURRENT_TIMESTAMP";
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:365](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L365)

***

### displayName? \{#displayname\}

```ts
displayName?: string;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L43)

Display name

#### Example

```ts
"User", "Order item"
```

#### Inherited from

`IEntityObject.displayName`

***

### encrypted? \{#encrypted\}

```ts
encrypted?: boolean;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:84](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L84)

Whether this is an encrypted column (transparent field-level encryption)

Encrypted with AES-GCM-256 by `@aiao/rxdb-adapter-encrypted` before writes and transparently decrypted after reads. An encrypted column cannot simultaneously be: primary key / foreign key / unique / sortable / index / computed property / FTS column.

#### Default

```ts
false
```

#### Inherited from

`IEntityObject.encrypted`

***

### format? \{#format\}

```ts
format?: DateTimeFormat;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:370](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L370)

Field semantic annotation. `display` only affects presentation, not the persistence precision

#### Default

```ts
{ kind: 'dateTime' }
```

***

### name \{#name\}

```ts
name: Uncapitalize<string>;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L31)

Name
An English word not starting with an uppercase letter; may only contain English words and underscores

#### Inherited from

`IEntityObject.name`

***

### nullable? \{#nullable\}

```ts
nullable?: boolean;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L64)

Whether the value can be NULL

#### Default

```ts
false
```

#### Inherited from

`IEntityObject.nullable`

***

### readonly? \{#readonly\}

```ts
readonly?: boolean;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L58)

Whether it is read-only
If true, the data is written only once at creation; when data is updated, this column's value is not updated
If false, the column's value is updated when data is updated

#### Default

```ts
false
```

#### Inherited from

`IEntityObject.readonly`

***

### required? \{#required\}

```ts
required?: boolean;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L73)

Whether it is required
Used for frontend validation
If true, the column must have a value when data is created
Empty strings and empty arrays are not allowed; the number 0 is allowed

#### Default

```ts
false
```

#### Inherited from

`IEntityObject.required`

***

### sortable? \{#sortable\}

```ts
sortable?: boolean;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:107](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L107)

Whether it is sortable

#### Default

```ts
false
```

#### Inherited from

`ISortable.sortable`

***

### type \{#type\}

```ts
type: "date" | date;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:364](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L364)

***

### unique? \{#unique\}

```ts
unique?: boolean;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L50)

Whether it is unique
If true, duplicate values are not allowed for this data

#### Default

```ts
false
```

#### Inherited from

`IEntityObject.unique`
