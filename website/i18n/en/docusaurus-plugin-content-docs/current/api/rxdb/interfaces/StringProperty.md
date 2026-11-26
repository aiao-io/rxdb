# StringProperty

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:217](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L217)

Variable-length string property

## Remarks

No length cap: adapters land it as `TEXT` (the SQLite family has no length concept, PGlite uses unconstrained `text`),
and length validation belongs to the business layer. Use [EnumProperty](EnumProperty.md) for a controlled value set,
use [JSONProperty](JSONProperty.md) for whole structured data — do not hand-serialize into strings.

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
default?: string | (() => string);
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:223](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L223)

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
  | PlainTextFormat
  | MultilineTextFormat
  | RichTextFormat
  | UrlFormat
  | EmailFormat
  | PhoneFormat
  | CodeFormat
  | ColorFormat;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:235](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L235)

Field semantics annotation; only affects presentation and front-end control selection, not the runtime value type

#### Default

```ts
{
  kind: 'plainText';
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

### primary? \{#primary\}

```ts
primary?: boolean;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:221](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L221)

Whether it is the primary key

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

### searchable? \{#searchable\}

```ts
searchable?: boolean;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:230](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L230)

Whether it is included in global search (FTS5 external content table)
Only effective for `StringProperty` / `EnumProperty` / `StringArrayProperty`

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
type: 'string' | string;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:222](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L222)

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
