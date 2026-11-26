# EnumProperty

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:256](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L256)

Property with a controlled set of values

## Remarks

The storage form is simply a string, no different from [StringProperty](StringProperty.md) in the database — `enum` narrows the
**type and metadata**, not a database-level constraint. So rows already persisted do not become unreadable because a value was later removed from `enum`;
cleaning up historical values is a migration's job.

`enum` is declared as `readonly string[]`; passing it with `as const` is what lets entity fields infer a literal union instead of `string`.

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
compiled into an entity-level CHECK named after the property, and — like entity-level `checks` — taking part in inheritance overrides by `name`.

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

The column name in the database
If not provided it is the same as name

#### Inherited from

`IEntityObject.columnName`

---

### default? \{#default\}

```ts
default?: string | (() => string);
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:270](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L270)

Default value

---

### displayName? \{#displayname\}

```ts
displayName?: string;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L43)

Display name

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

Whether this is an encrypted column (transparent field-level encryption)

Encrypted with AES-GCM-256 by `@aiao/rxdb-adapter-encrypted` before writes and
transparently decrypted after reads. An encrypted column cannot also be:
primary key / foreign key / unique / sortable / index / computed field / FTS column.

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

The list of enum options
Defines all the enum values this field allows

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

Field semantics annotation. An enum property can only declare single selection

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

Name
An English word not starting with an uppercase letter; may only contain English letters and underscores

#### Inherited from

`IEntityObject.name`

---

### nullable? \{#nullable\}

```ts
nullable?: boolean;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L64)

Whether it can be NULL

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

Display metadata of the enum values; keys must be a subset of `enum`

---

### readonly? \{#readonly\}

```ts
readonly?: boolean;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L58)

Whether it is read-only
If true, the value is written only once at creation and the column is not updated when the data is updated
If false, the column is updated when the data is updated

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

Whether it is required
Used for front-end validation
If true, a value must be provided for this column when creating data
Empty strings and empty arrays are not allowed; the number 0 is allowed

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

Whether to include it in global search (indexed by the raw string)

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

Whether it is sortable

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

Property type

---

### unique? \{#unique\}

```ts
unique?: boolean;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L50)

Whether it is unique
If true, the value of this column must not repeat

#### Default

```ts
false;
```

#### Inherited from

`IEntityObject.unique`
