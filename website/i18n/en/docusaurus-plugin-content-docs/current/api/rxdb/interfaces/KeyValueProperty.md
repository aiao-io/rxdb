# KeyValueProperty

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:436](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L436)

keyValue
An object storing key-value pairs, suitable for simple configuration items or dynamic property collections

## Remarks

The difference from [JSONProperty](JSONProperty.md) is that it **requires declaring** `properties` up front: the value is still stored whole in one column,
but every key's type and default are known, so it can take part in type inference. Use JSON only when the structure is not fixed.

## Extends

- `IEntityObject`

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

The column name in the database
If not provided it is the same as name

#### Inherited from

`IEntityObject.columnName`

***

### default? \{#default\}

```ts
default?: 
  | KeyValue
  | (() => KeyValue);
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:438](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L438)

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
primary key / foreign key / unique / sortable / index / computed field / FTS column.

#### Default

```ts
false
```

#### Inherited from

`IEntityObject.encrypted`

***

### name \{#name\}

```ts
name: Uncapitalize<string>;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L31)

Name
An English word not starting with an uppercase letter; may only contain English letters and underscores

#### Inherited from

`IEntityObject.name`

***

### nullable? \{#nullable\}

```ts
nullable?: boolean;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L64)

Whether it can be NULL

#### Default

```ts
false
```

#### Inherited from

`IEntityObject.nullable`

***

### properties \{#properties\}

```ts
properties: KeyValuePropertyMetadata[];
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:439](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L439)

***

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
If true, a value must be provided for this column when creating data
Empty strings and empty arrays are not allowed; the number 0 is allowed

#### Default

```ts
false
```

#### Inherited from

`IEntityObject.required`

***

### type \{#type\}

```ts
type: "keyValue" | keyValue;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:437](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L437)

***

### unique? \{#unique\}

```ts
unique?: boolean;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L50)

Whether it is unique
If true, the value of this column must not repeat

#### Default

```ts
false
```

#### Inherited from

`IEntityObject.unique`
