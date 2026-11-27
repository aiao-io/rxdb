# NumberProperty

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:413](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L413)

Number group

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

Column name in the database
Same as name when not provided

#### Inherited from

`IEntityObject.columnName`

---

### default? \{#default\}

```ts
default?: number | (() => number);
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:415](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L415)

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
primary key / foreign key / unique / sortable / index / computed property / FTS column.

#### Default

```ts
false;
```

#### Inherited from

`IEntityObject.encrypted`

---

### format? \{#format\}

```ts
format?:
  | NumberFormat
  | CurrencyFormat
  | PercentageFormat
  | RatingFormat
  | DurationFormat;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:420](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L420)

Field semantics annotation; only affects presentation and front-end control selection, not the runtime value type

#### Default

```ts
{
  kind: 'number';
}
```

---

### name \{#name\}

```ts
name: Uncapitalize<string>;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L31)

Name
A lowercase-initial English word; may only contain English words and underscores

#### Inherited from

`IEntityObject.name`

---

### nullable? \{#nullable\}

```ts
nullable?: boolean;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L64)

Whether NULL is allowed

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

Whether it is read-only
If true, this data is written only once at creation; when updating data, the value of this column is not updated
If false, the value of this column is updated when updating data

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
If true, this column must be provided when creating data
Empty strings and empty arrays are not allowed; the number 0 is allowed

#### Default

```ts
false;
```

#### Inherited from

`IEntityObject.required`

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
type: 'number' | number;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:414](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L414)

---

### unique? \{#unique\}

```ts
unique?: boolean;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L50)

Whether it is unique
If true, the value of this data must not repeat

#### Default

```ts
false;
```

#### Inherited from

`IEntityObject.unique`
