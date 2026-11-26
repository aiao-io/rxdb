# OperatorRegistry

Defined in: [packages/rxdb-model/src/query-builder/services/operator-registry.service.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/operator-registry.service.ts#L31)

Operator registry service
Manages available operators and their metadata

## Constructors

### Constructor

```ts
new OperatorRegistry(options?): OperatorRegistry;
```

Defined in: [packages/rxdb-model/src/query-builder/services/operator-registry.service.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/operator-registry.service.ts#L42)

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`OperatorRegistryOptions`](../interfaces/OperatorRegistryOptions.md) | Set of operators registered initially |

#### Returns

`OperatorRegistry`

## Accessors

### size \{#size\}

#### Get Signature

```ts
get size(): number;
```

Defined in: [packages/rxdb-model/src/query-builder/services/operator-registry.service.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/operator-registry.service.ts#L37)

Gets the number of operators

##### Returns

`number`

## Methods

### clear() \{#clear\}

```ts
clear(): void;
```

Defined in: [packages/rxdb-model/src/query-builder/services/operator-registry.service.ts:203](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/operator-registry.service.ts#L203)

Clears all operators

#### Returns

`void`

***

### get() \{#get\}

```ts
get(key): OperatorDefinition | undefined;
```

Defined in: [packages/rxdb-model/src/query-builder/services/operator-registry.service.ts:106](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/operator-registry.service.ts#L106)

Gets an operator definition

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `key` | [`OperatorName`](../type-aliases/OperatorName.md) | Operator key |

#### Returns

[`OperatorDefinition`](../interfaces/OperatorDefinition.md) \| `undefined`

The operator definition or undefined

***

### getAll() \{#getall\}

```ts
getAll(): OperatorDefinition[];
```

Defined in: [packages/rxdb-model/src/query-builder/services/operator-registry.service.ts:115](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/operator-registry.service.ts#L115)

Gets all operators

#### Returns

[`OperatorDefinition`](../interfaces/OperatorDefinition.md)[]

Array of all operator definitions

***

### getForField() \{#getforfield\}

```ts
getForField(field): OperatorDefinition[];
```

Defined in: [packages/rxdb-model/src/query-builder/services/operator-registry.service.ts:141](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/operator-registry.service.ts#L141)

Gets the operators applicable to the field metadata

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `field` | [`FieldMetadata`](../interfaces/FieldMetadata.md) | Field metadata |

#### Returns

[`OperatorDefinition`](../interfaces/OperatorDefinition.md)[]

Array of applicable operators

***

### getForType() \{#getfortype\}

```ts
getForType(fieldType): OperatorDefinition[];
```

Defined in: [packages/rxdb-model/src/query-builder/services/operator-registry.service.ts:131](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/operator-registry.service.ts#L131)

Gets the operators applicable to the field type

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `fieldType` | [`PropertyType`](../type-aliases/PropertyType.md) | Field type |

#### Returns

[`OperatorDefinition`](../interfaces/OperatorDefinition.md)[]

Array of applicable operators

#### Example

```typescript
const stringOperators = registry.getForType('string');
// [{ key: '=', ... }, { key: 'contains', ... }, ...]
```

***

### getValueType() \{#getvaluetype\}

```ts
getValueType(operatorKey): "array" | "single" | "range" | "none" | "subquery" | undefined;
```

Defined in: [packages/rxdb-model/src/query-builder/services/operator-registry.service.ts:195](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/operator-registry.service.ts#L195)

Gets the value type of an operator

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `operatorKey` | [`OperatorName`](../type-aliases/OperatorName.md) | Operator key |

#### Returns

`"array"` \| `"single"` \| `"range"` \| `"none"` \| `"subquery"` \| `undefined`

The value type

***

### isOperatorSupportedForField() \{#isoperatorsupportedforfield\}

```ts
isOperatorSupportedForField(operatorKey, field): boolean;
```

Defined in: [packages/rxdb-model/src/query-builder/services/operator-registry.service.ts:185](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/operator-registry.service.ts#L185)

Checks whether the operator supports the given field

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `operatorKey` | [`OperatorName`](../type-aliases/OperatorName.md) | Operator key |
| `field` | [`FieldMetadata`](../interfaces/FieldMetadata.md) | Field metadata |

#### Returns

`boolean`

Whether it is supported

***

### isOperatorSupportedForType() \{#isoperatorsupportedfortype\}

```ts
isOperatorSupportedForType(operatorKey, fieldType): boolean;
```

Defined in: [packages/rxdb-model/src/query-builder/services/operator-registry.service.ts:173](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/operator-registry.service.ts#L173)

Checks whether the operator supports the given type

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `operatorKey` | [`OperatorName`](../type-aliases/OperatorName.md) | Operator key |
| `fieldType` | [`PropertyType`](../type-aliases/PropertyType.md) | Field type |

#### Returns

`boolean`

Whether it is supported

***

### register() \{#register\}

```ts
register(operator): void;
```

Defined in: [packages/rxdb-model/src/query-builder/services/operator-registry.service.ts:75](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/operator-registry.service.ts#L75)

Registers a new operator

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `operator` | [`OperatorDefinition`](../interfaces/OperatorDefinition.md) | Operator definition |

#### Returns

`void`

#### Example

```typescript
registry.register({
  key: 'contains',
  label: 'Contains',
  applicableTypes: ['string'],
  valueType: 'single'
});
```

***

### registerMany() \{#registermany\}

```ts
registerMany(operators): void;
```

Defined in: [packages/rxdb-model/src/query-builder/services/operator-registry.service.ts:84](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/operator-registry.service.ts#L84)

Registers operators in bulk

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `operators` | [`OperatorDefinition`](../interfaces/OperatorDefinition.md)[] | Array of operator definitions |

#### Returns

`void`

***

### reset() \{#reset\}

```ts
reset(): void;
```

Defined in: [packages/rxdb-model/src/query-builder/services/operator-registry.service.ts:210](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/operator-registry.service.ts#L210)

Resets to the default operators

#### Returns

`void`

***

### unregister() \{#unregister\}

```ts
unregister(key): boolean;
```

Defined in: [packages/rxdb-model/src/query-builder/services/operator-registry.service.ts:96](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/operator-registry.service.ts#L96)

Removes an operator

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `key` | [`OperatorName`](../type-aliases/OperatorName.md) | Operator key |

#### Returns

`boolean`

Whether it was removed successfully
