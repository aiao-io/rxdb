# DateProperty

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:363](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L363)

Date/time property

## Remarks

Besides `Date` and a generator function, `default` also accepts the sentinel string `'CURRENT_TIMESTAMP'`,
which declares a **database-side DEFAULT at table creation** (PGlite renders it as `now()`), not a string literal.
Use it when timestamps must be comparable across devices — client clocks all differ.

Note that not every write path evaluates it in the database: bulk inserts explicitly provide every column and bypass the DB DEFAULT,
so the adapter replaces the sentinel with the client's current time on the spot there (see `inserts_sql.ts`).
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

Property-level CHECK constraint (syntactic sugar): a [PropertyCheckRule](../type-aliases/PropertyCheckRule.md) with `field` omitted,
compiled into an entity-level CHECK with the property name as its `name`, and participating in inheritance overriding by `name` just like entity-level `checks`.

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
Same as name when not provided

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

Encrypted with AES-GCM-256 by `@aiao/rxdb-adapter-encrypted` before writes and
transparently decrypted after reads. An encrypted column cannot also be:
primary key / foreign key / unique / sortable / index / computed property / FTS column.

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

Field semantics annotation. `display` only affects presentation and does not change the persistence precision

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
A lowercase-initial English word; may only contain English words and underscores

#### Inherited from

`IEntityObject.name`

***

### nullable? \{#nullable\}

```ts
nullable?: boolean;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L64)

Whether NULL is allowed

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
If true, this data is written only once at creation; when updating data, the value of this column is not updated
If false, the value of this column is updated when updating data

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
Used for front-end validation
If true, this column must be provided when creating data
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
If true, the value of this data must not repeat

#### Default

```ts
false
```

#### Inherited from

`IEntityObject.unique`
