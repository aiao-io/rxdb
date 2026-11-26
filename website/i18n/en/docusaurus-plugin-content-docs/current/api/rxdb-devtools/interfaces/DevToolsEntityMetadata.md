# DevToolsEntityMetadata

Defined in: [connector-types.ts:71](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-types.ts#L71)

The subset of entity metadata that DevTools actually reads.

## Remarks

Deliberately wider than the upstream `EntityMetadata` (`ReadonlyMap<string, unknown>` instead
of `Map<string, EntityPropertyMetadata>`): the connector only takes `keys()` as the list of
encrypted field names and never touches the values. The real `EntityMetadata` is assignable to
this type; that direction is guarded by the compile-time contract in
`rxdb-contract.spec.ts`.

## Properties

### computedPropertyMap? \{#computedpropertymap\}

```ts
readonly computedPropertyMap?: ReadonlyMap<string, unknown>;
```

Defined in: [connector-types.ts:81](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-types.ts#L81)

Computed-property metadata; the connector only reads names and display names.

***

### displayName? \{#displayname\}

```ts
readonly displayName?: string;
```

Defined in: [connector-types.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-types.ts#L85)

The entity's display name.

***

### encryptedPropertyMap? \{#encryptedpropertymap\}

```ts
readonly encryptedPropertyMap?: ReadonlyMap<string, unknown>;
```

Defined in: [connector-types.ts:77](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-types.ts#L77)

The set of field names declared as encrypted columns; only the keys are read.

***

### foreignKeyRelationMap? \{#foreignkeyrelationmap\}

```ts
readonly foreignKeyRelationMap?: ReadonlyMap<string, unknown>;
```

Defined in: [connector-types.ts:83](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-types.ts#L83)

Foreign key relation metadata; the connector only reads relation types and display names.

***

### name \{#name\}

```ts
readonly name: string;
```

Defined in: [connector-types.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-types.ts#L73)

The entity name.

***

### namespace? \{#namespace\}

```ts
readonly namespace?: string;
```

Defined in: [connector-types.ts:75](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-types.ts#L75)

The namespace the entity belongs to; treated as `'public'` when omitted.

***

### propertyMap? \{#propertymap\}

```ts
readonly propertyMap?: ReadonlyMap<string, unknown>;
```

Defined in: [connector-types.ts:79](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-types.ts#L79)

Plain property metadata; the connector only reads the safe field projection.
