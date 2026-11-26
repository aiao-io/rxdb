# EnumProperty

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:256](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L256)

Property with a controlled set of values.

## Remarks

The storage form is just a string — no difference from [StringProperty](StringProperty.md) in the database.
What `enum` narrows is the **type and metadata**, not a database-level constraint. So rows already persisted
do not become unreadable because a value was later removed from `enum`; cleaning up historical values is a
migration's job.

`enum` is declared as `readonly string[]`; pass it with `as const` so the entity field is inferred as a literal
union instead of `string`.

## Extends

- `IEntityObject`
- `ISortable`

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
default?: string | (() => string);
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:270](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L270)

Default value.

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

### enum \{#enum\}

```ts
enum: readonly string[];
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:266](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L266)

Enum option list.
Defines all enum values allowed for this field.

#### Example

```ts
['active', 'inactive', 'pending'];
```

---

### format? \{#format\}

```ts
format?: SingleSelectFormat;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:281](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L281)

Field semantic annotation. An enum property can only declare single-select.

#### Default

```ts
{
  kind: 'singleSelect';
}
```

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

### options? \{#options\}

```ts
options?: Readonly<Record<string, FieldOptionDisplay>>;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:285](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L285)

Display metadata of enum values; keys must be a subset of `enum`.

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

### searchable? \{#searchable\}

```ts
searchable?: boolean;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:276](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L276)

Whether to include it in global search (indexed by the raw string).

#### Default

```ts
false;
```

#### See

@aiao/rxdb-plugin-search

---

### sortable? \{#sortable\}

```ts
sortable?: boolean;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:107](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L107)

Whether it is sortable.

#### Default

```ts
false;
```

#### Inherited from

`ISortable.sortable`

---

### type \{#type\}

```ts
type: "enum" | enum;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:260](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L260)

Property type.

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
