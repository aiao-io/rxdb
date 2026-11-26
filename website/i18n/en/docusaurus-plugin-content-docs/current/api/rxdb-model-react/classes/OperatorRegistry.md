# OperatorRegistry

Defined in: packages/rxdb-model/dist/query-builder/services/operator-registry.service.d.ts:23

Operator registry service
Manages available operators and their metadata

## Constructors

### Constructor

```ts
new OperatorRegistry(options?): OperatorRegistry;
```

Defined in: packages/rxdb-model/dist/query-builder/services/operator-registry.service.d.ts:30

#### Parameters

| Parameter  | Type                                                                  | Description                                |
| ---------- | --------------------------------------------------------------------- | ------------------------------------------ |
| `options?` | [`OperatorRegistryOptions`](../interfaces/OperatorRegistryOptions.md) | The set of operators to register initially |

#### Returns

`OperatorRegistry`

## Accessors

### size \{#size\}

#### Get Signature

```ts
get size(): number;
```

Defined in: packages/rxdb-model/dist/query-builder/services/operator-registry.service.d.ts:28

Gets the number of operators

##### Returns

`number`

## Methods

### clear() \{#clear\}

```ts
clear(): void;
```

Defined in: packages/rxdb-model/dist/query-builder/services/operator-registry.service.d.ts:119

Clears all operators

#### Returns

`void`

---

### get() \{#get\}

```ts
get(key): OperatorDefinition | undefined;
```

Defined in: packages/rxdb-model/dist/query-builder/services/operator-registry.service.d.ts:66

Gets an operator definition

#### Parameters

| Parameter | Type                                              | Description  |
| --------- | ------------------------------------------------- | ------------ |
| `key`     | [`OperatorName`](../type-aliases/OperatorName.md) | Operator key |

#### Returns

[`OperatorDefinition`](../interfaces/OperatorDefinition.md) \| `undefined`

The operator definition or undefined

---

### getAll() \{#getall\}

```ts
getAll(): OperatorDefinition[];
```

Defined in: packages/rxdb-model/dist/query-builder/services/operator-registry.service.d.ts:72

Gets all operators

#### Returns

[`OperatorDefinition`](../interfaces/OperatorDefinition.md)[]

Array of all operator definitions

---

### getForField() \{#getforfield\}

```ts
getForField(field): OperatorDefinition[];
```

Defined in: packages/rxdb-model/dist/query-builder/services/operator-registry.service.d.ts:92

Gets the applicable operators for field metadata

#### Parameters

| Parameter | Type                                              | Description    |
| --------- | ------------------------------------------------- | -------------- |
| `field`   | [`FieldMetadata`](../interfaces/FieldMetadata.md) | Field metadata |

#### Returns

[`OperatorDefinition`](../interfaces/OperatorDefinition.md)[]

Array of applicable operators

---

### getForType() \{#getfortype\}

```ts
getForType(fieldType): OperatorDefinition[];
```

Defined in: packages/rxdb-model/dist/query-builder/services/operator-registry.service.d.ts:85

Gets the applicable operators for a field type

#### Parameters

| Parameter   | Type                                              | Description |
| ----------- | ------------------------------------------------- | ----------- |
| `fieldType` | [`PropertyType`](../type-aliases/PropertyType.md) | Field type  |

#### Returns

[`OperatorDefinition`](../interfaces/OperatorDefinition.md)[]

Array of applicable operators

#### Example

```typescript
const stringOperators = registry.getForType('string');
// [{ key: '=', ... }, { key: 'contains', ... }, ...]
```

---

### getValueType() \{#getvaluetype\}

```ts
getValueType(operatorKey): "none" | "range" | "array" | "subquery" | "single" | undefined;
```

Defined in: packages/rxdb-model/dist/query-builder/services/operator-registry.service.d.ts:115

Gets the value type of an operator

#### Parameters

| Parameter     | Type                                              | Description  |
| ------------- | ------------------------------------------------- | ------------ |
| `operatorKey` | [`OperatorName`](../type-aliases/OperatorName.md) | Operator key |

#### Returns

`"none"` \| `"range"` \| `"array"` \| `"subquery"` \| `"single"` \| `undefined`

Value type

---

### isOperatorSupportedForField() \{#isoperatorsupportedforfield\}

```ts
isOperatorSupportedForField(operatorKey, field): boolean;
```

Defined in: packages/rxdb-model/dist/query-builder/services/operator-registry.service.d.ts:108

Checks whether the operator supports the given field

#### Parameters

| Parameter     | Type                                              | Description    |
| ------------- | ------------------------------------------------- | -------------- |
| `operatorKey` | [`OperatorName`](../type-aliases/OperatorName.md) | Operator key   |
| `field`       | [`FieldMetadata`](../interfaces/FieldMetadata.md) | Field metadata |

#### Returns

`boolean`

Whether it is supported

---

### isOperatorSupportedForType() \{#isoperatorsupportedfortype\}

```ts
isOperatorSupportedForType(operatorKey, fieldType): boolean;
```

Defined in: packages/rxdb-model/dist/query-builder/services/operator-registry.service.d.ts:100

Checks whether the operator supports the given type

#### Parameters

| Parameter     | Type                                              | Description  |
| ------------- | ------------------------------------------------- | ------------ |
| `operatorKey` | [`OperatorName`](../type-aliases/OperatorName.md) | Operator key |
| `fieldType`   | [`PropertyType`](../type-aliases/PropertyType.md) | Field type   |

#### Returns

`boolean`

Whether it is supported

---

### register() \{#register\}

```ts
register(operator): void;
```

Defined in: packages/rxdb-model/dist/query-builder/services/operator-registry.service.d.ts:46

Registers a new operator

#### Parameters

| Parameter  | Type                                                        | Description         |
| ---------- | ----------------------------------------------------------- | ------------------- |
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

---

### registerMany() \{#registermany\}

```ts
registerMany(operators): void;
```

Defined in: packages/rxdb-model/dist/query-builder/services/operator-registry.service.d.ts:52

Registers operators in bulk

#### Parameters

| Parameter   | Type                                                          | Description                   |
| ----------- | ------------------------------------------------------------- | ----------------------------- |
| `operators` | [`OperatorDefinition`](../interfaces/OperatorDefinition.md)[] | Array of operator definitions |

#### Returns

`void`

---

### reset() \{#reset\}

```ts
reset(): void;
```

Defined in: packages/rxdb-model/dist/query-builder/services/operator-registry.service.d.ts:123

Resets to the default operators

#### Returns

`void`

---

### unregister() \{#unregister\}

```ts
unregister(key): boolean;
```

Defined in: packages/rxdb-model/dist/query-builder/services/operator-registry.service.d.ts:59

Removes an operator

#### Parameters

| Parameter | Type                                              | Description  |
| --------- | ------------------------------------------------- | ------------ |
| `key`     | [`OperatorName`](../type-aliases/OperatorName.md) | Operator key |

#### Returns

`boolean`

Whether it was removed successfully
