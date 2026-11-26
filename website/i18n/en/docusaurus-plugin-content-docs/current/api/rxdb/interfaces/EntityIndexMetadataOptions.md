# EntityIndexMetadataOptions

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:513](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L513)

Entity index metadata interface.
Defines the configuration of an entity index.

## Extends

- `IEntityObject`

## Properties

### check? \{#check\}

```ts
check?: PropertyCheckRule;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:95](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L95)

Property-level CHECK constraint (syntactic sugar): a [PropertyCheckRule](../type-aliases/PropertyCheckRule.md)
with `field` omitted, compiled into an entity-level CHECK named after the property; like entity-level `checks`,
it participates in inheritance overriding by `name`.

#### Example

```typescript
properties: [{ name: 'qty', type: PropertyType.integer, check: { operator: '>', value: 0 } }];
```

#### Inherited from

`IEntityObject.check`

---

### columnName? \{#columnname\}

```ts
columnName?: string;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L37)

The column name in the database.
When omitted, it is the same as `name`.

#### Inherited from

`IEntityObject.columnName`

---

### displayName? \{#displayname\}

```ts
displayName?: string;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L43)

Display name.

#### Example

```ts
('User', 'Order item');
```

#### Inherited from

`IEntityObject.displayName`

---

### encrypted? \{#encrypted\}

```ts
encrypted?: boolean;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:84](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L84)

Whether this is an encrypted column (transparent field-level encryption).

Encrypted by `@aiao/rxdb-adapter-encrypted` with AES-GCM-256 before writing, and transparently decrypted
after reading. An encrypted column cannot also be:
a primary key / foreign key / unique / sortable / index / computed property / FTS column.

#### Default

```ts
false;
```

#### Inherited from

`IEntityObject.encrypted`

---

### name \{#name\}

```ts
name: Uncapitalize<string>;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L31)

Name.
An English word not starting with a capital letter; may only contain English words and underscores.

#### Inherited from

`IEntityObject.name`

---

### normalized? \{#normalized\}

```ts
normalized?: boolean;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:542](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L542)

Normalized unique index: **every column** of the index participates in comparison as
`lower(COALESCE(CAST(column AS TEXT), ''))`.

#### Remarks

Only meaningful with `unique: true`; appearing alone throws while building metadata (no silent downgrade).

Solves two things:

1. **NULL disables an entire unique index.** Per the SQL standard, every NULL is unequal to every other,
   so an ordinary UNIQUE on `(parentId, name, extension)` stops **no row at all** for "root nodes"
   (`parentId IS NULL`) and "folders" (`extension IS NULL`). After `COALESCE(…, '')` folds NULL into
   a real value, the tuples become comparable again.
2. **Case variants bypass duplicate-name validation.** Same-level duplicate detection in tree UIs is
   generally `a.toLowerCase() === b.toLowerCase()`; if the database is case-sensitive, a duplicate the
   UI blocks can be written straight through the repository under a different casing. `lower()` makes
   both sides use the same measure.

The index is still a **multi-column tuple**, not a concatenated string — `('a', 'bc')` and `('ab', 'c')`
do not conflict.

#### Example

```typescript
indexes: [`{ name: 'parent_fullname', properties: ['parentId', 'name', 'extension'], unique: true, normalized: true }`];
```

#### Default Value

`false`

---

### nullable? \{#nullable\}

```ts
nullable?: boolean;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L64)

Whether NULL is allowed.

#### Default

```ts
false;
```

#### Inherited from

`IEntityObject.nullable`

---

### properties? \{#properties\}

```ts
properties?: string[];
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:514](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L514)

---

### readonly? \{#readonly\}

```ts
readonly?: boolean;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L58)

Whether it is read-only.
If true, this column is written only once at creation; its value is not updated when the row is updated.
If false, its value is updated when the row is updated.

#### Default

```ts
false;
```

#### Inherited from

`IEntityObject.readonly`

---

### required? \{#required\}

```ts
required?: boolean;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L73)

Whether it is required.
Used for frontend validation.
If true, a value must be provided for this column when creating data.
Empty strings and empty arrays are not allowed; the number 0 is allowed.

#### Default

```ts
false;
```

#### Inherited from

`IEntityObject.required`

---

### unique? \{#unique\}

```ts
unique?: boolean;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L50)

Whether it is unique.
If true, duplicate values are not allowed.

#### Default

```ts
false;
```

#### Inherited from

`IEntityObject.unique`

---

### where? \{#where\}

```ts
where?: CheckRuleGroup;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:566](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L566)

Conditional uniqueness: a unique constraint that applies only to rows satisfying the predicate
(a partial unique index, US-030 phase B).

#### Remarks

Shares the same single-row rule group and the same literal compilation path as entity-level `checks`
(operator whitelist and `ref` — see [CheckRuleGroup](CheckRuleGroup.md)); only meaningful with
`unique: true`, and errors at metadata time if it appears alone. The index name is generated
deterministically from `uq_` + table name + `name` + the hash of the normalized definition (`name` is
limited to `[a-z][a-z0-9_]*`); if it is missing or extra on an existing table, `init()` throws
`RxDBConstraintDriftError` without auto-creating it. Violations are reported the same way as ordinary
unique conflicts (PG `23505` / SQLite `UNIQUE constraint failed`).

#### Example

```typescript
indexes: [
  {
    name: 'released_effective_from',
    properties: ['itemId', 'effectiveFrom'],
    unique: true,
    where: `{ combinator: 'and', rules: [{ field: 'state', operator: '=', value: 'released' }] }`
  }
];
```
