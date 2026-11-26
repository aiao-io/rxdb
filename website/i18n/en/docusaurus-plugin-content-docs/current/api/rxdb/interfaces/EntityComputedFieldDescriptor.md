# EntityComputedFieldDescriptor

Defined in: [packages/rxdb/src/entity/entity-field.utils.ts:244](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-field.utils.ts#L244)

Descriptor for a computed property: exposes the real `valueType` and is always read-only.

## Extends

- `EntityFieldDescriptorBase`

## Properties

### cardinality \{#cardinality\}

```ts
cardinality: FieldCardinality;
```

Defined in: [packages/rxdb/src/entity/entity-field.utils.ts:221](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-field.utils.ts#L221)

#### Inherited from

`EntityFieldDescriptorBase.cardinality`

***

### displayName \{#displayname\}

```ts
displayName: string;
```

Defined in: [packages/rxdb/src/entity/entity-field.utils.ts:220](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-field.utils.ts#L220)

#### Inherited from

`EntityFieldDescriptorBase.displayName`

***

### encrypted \{#encrypted\}

```ts
encrypted: boolean;
```

Defined in: [packages/rxdb/src/entity/entity-field.utils.ts:228](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-field.utils.ts#L228)

#### Inherited from

`EntityFieldDescriptorBase.encrypted`

***

### enum? \{#enum\}

```ts
enum?: readonly string[];
```

Defined in: [packages/rxdb/src/entity/entity-field.utils.ts:232](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-field.utils.ts#L232)

#### Inherited from

`EntityFieldDescriptorBase.enum`

***

### field \{#field\}

```ts
field: string;
```

Defined in: [packages/rxdb/src/entity/entity-field.utils.ts:219](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-field.utils.ts#L219)

#### Inherited from

`EntityFieldDescriptorBase.field`

***

### format? \{#format\}

```ts
format?: FieldFormat;
```

Defined in: [packages/rxdb/src/entity/entity-field.utils.ts:223](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-field.utils.ts#L223)

#### Inherited from

`EntityFieldDescriptorBase.format`

***

### keyValueSchema? \{#keyvalueschema\}

```ts
keyValueSchema?: Record<string, KeyValueSchemaEntry>;
```

Defined in: [packages/rxdb/src/entity/entity-field.utils.ts:234](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-field.utils.ts#L234)

#### Inherited from

`EntityFieldDescriptorBase.keyValueSchema`

***

### nullable \{#nullable\}

```ts
nullable: boolean;
```

Defined in: [packages/rxdb/src/entity/entity-field.utils.ts:225](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-field.utils.ts#L225)

#### Inherited from

`EntityFieldDescriptorBase.nullable`

***

### options? \{#options\}

```ts
options?: Readonly<Record<string, FieldOptionDisplay>>;
```

Defined in: [packages/rxdb/src/entity/entity-field.utils.ts:233](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-field.utils.ts#L233)

#### Inherited from

`EntityFieldDescriptorBase.options`

***

### primary? \{#primary\}

```ts
primary?: boolean;
```

Defined in: [packages/rxdb/src/entity/entity-field.utils.ts:231](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-field.utils.ts#L231)

#### Inherited from

`EntityFieldDescriptorBase.primary`

***

### readonly \{#readonly\}

```ts
readonly: true;
```

Defined in: [packages/rxdb/src/entity/entity-field.utils.ts:246](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-field.utils.ts#L246)

#### Overrides

`EntityFieldDescriptorBase.readonly`

***

### relation? \{#relation\}

```ts
relation?: undefined;
```

Defined in: [packages/rxdb/src/entity/entity-field.utils.ts:247](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-field.utils.ts#L247)

***

### required \{#required\}

```ts
required: boolean;
```

Defined in: [packages/rxdb/src/entity/entity-field.utils.ts:226](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-field.utils.ts#L226)

#### Inherited from

`EntityFieldDescriptorBase.required`

***

### searchable? \{#searchable\}

```ts
searchable?: boolean;
```

Defined in: [packages/rxdb/src/entity/entity-field.utils.ts:230](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-field.utils.ts#L230)

#### Inherited from

`EntityFieldDescriptorBase.searchable`

***

### sortable? \{#sortable\}

```ts
sortable?: boolean;
```

Defined in: [packages/rxdb/src/entity/entity-field.utils.ts:229](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-field.utils.ts#L229)

#### Inherited from

`EntityFieldDescriptorBase.sortable`

***

### source \{#source\}

```ts
source: "computed";
```

Defined in: [packages/rxdb/src/entity/entity-field.utils.ts:245](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-field.utils.ts#L245)

***

### unique \{#unique\}

```ts
unique: boolean;
```

Defined in: [packages/rxdb/src/entity/entity-field.utils.ts:227](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-field.utils.ts#L227)

#### Inherited from

`EntityFieldDescriptorBase.unique`

***

### valueType \{#valuetype\}

```ts
valueType: 
  | "string"
  | "number"
  | "bigint"
  | "boolean"
  | "date"
  | "uuid"
  | "enum"
  | "integer"
  | "binary"
  | "stringArray"
  | "numberArray"
  | "keyValue"
  | "json";
```

Defined in: [packages/rxdb/src/entity/entity-field.utils.ts:222](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-field.utils.ts#L222)

#### Inherited from

`EntityFieldDescriptorBase.valueType`
