# BinaryProperty

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:346](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L346)

Uint8Array byte-sequence property.

## Remarks

The default value is copied per entity. In-place mutation does not trigger the entity Proxy; persisting a
change requires reassignment. The SQLite family and the PGlite local adapters support the current view of a
`Uint8Array`; the Supabase remote does not.

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

### default? \{#default\}

```ts
default?: Uint8Array<ArrayBufferLike> | (() => Uint8Array);
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:348](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L348)

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

### type \{#type\}

```ts
type: 'binary' | binary;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:347](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L347)

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
