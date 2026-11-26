# PropertyType

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:114](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L114)

Entity property type enumeration
Defines the data types supported by entity properties

## Enumeration Members

### bigint \{#bigint\}

```ts
bigint: "bigint";
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:147](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L147)

Signed 64-bit integer

#### Remarks

At runtime only `bigint` is accepted; see [BigIntProperty](../interfaces/BigIntProperty.md).

***

### binary \{#binary\}

```ts
binary: "binary";
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:165](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L165)

Byte sequence (`Uint8Array`)

#### Remarks

The runtime value type is `Uint8Array`; see [BinaryProperty](../interfaces/BinaryProperty.md).

***

### boolean \{#boolean\}

```ts
boolean: "boolean";
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:152](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L152)

Boolean value

***

### date \{#date\}

```ts
date: "date";
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:157](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L157)

Date and time

***

### enum \{#enum\}

```ts
enum: "enum";
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:129](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L129)

Enumeration

***

### integer \{#integer\}

```ts
integer: "integer";
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:139](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L139)

Integer

***

### json \{#json\}

```ts
json: "json";
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:187](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L187)

JSON object

***

### keyValue \{#keyvalue\}

```ts
keyValue: "keyValue";
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:182](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L182)

Key-value pair object

***

### number \{#number\}

```ts
number: "number";
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:134](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L134)

Number

***

### numberArray \{#numberarray\}

```ts
numberArray: "numberArray";
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:176](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L176)

Number array

***

### string \{#string\}

```ts
string: "string";
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:124](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L124)

String

***

### stringArray \{#stringarray\}

```ts
stringArray: "stringArray";
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:171](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L171)

String array

***

### uuid \{#uuid\}

```ts
uuid: "uuid";
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:119](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L119)

UUID
