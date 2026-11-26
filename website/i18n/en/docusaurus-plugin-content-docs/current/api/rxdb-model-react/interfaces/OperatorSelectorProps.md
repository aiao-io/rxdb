# OperatorSelectorProps

Defined in: [packages/rxdb-model-react/src/query-builder/operator-selector/operator-selector.tsx:16](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/operator-selector/operator-selector.tsx#L16)

Props of [OperatorSelector](../functions/OperatorSelector.md).

## Properties

### fieldMetadata? \{#fieldmetadata\}

```ts
fieldMetadata?: FieldMetadata;
```

Defined in: [packages/rxdb-model-react/src/query-builder/operator-selector/operator-selector.tsx:18](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/operator-selector/operator-selector.tsx#L18)

Field metadata (takes precedence over fieldType when deriving operators).

***

### fieldType? \{#fieldtype\}

```ts
fieldType?: string;
```

Defined in: [packages/rxdb-model-react/src/query-builder/operator-selector/operator-selector.tsx:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/operator-selector/operator-selector.tsx#L20)

Field type (operators are derived from the type when no metadata is given), defaults to `'string'`.

***

### onOperatorChange? \{#onoperatorchange\}

```ts
onOperatorChange?: (operator) => void;
```

Defined in: [packages/rxdb-model-react/src/query-builder/operator-selector/operator-selector.tsx:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/operator-selector/operator-selector.tsx#L24)

Selection callback.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `operator` | `string` |

#### Returns

`void`

***

### selectedOperator? \{#selectedoperator\}

```ts
selectedOperator?: string;
```

Defined in: [packages/rxdb-model-react/src/query-builder/operator-selector/operator-selector.tsx:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/operator-selector/operator-selector.tsx#L22)

Currently selected operator, defaults to `'='`.
