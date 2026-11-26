# ValueInputProps

Defined in: [packages/rxdb-model-react/src/query-builder/value-input/value-input.tsx:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/value-input/value-input.tsx#L31)

Props of [ValueInput](../functions/ValueInput.md).

## Properties

### enumOptions? \{#enumoptions\}

```ts
enumOptions?: unknown[];
```

Defined in: [packages/rxdb-model-react/src/query-builder/value-input/value-input.tsx:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/value-input/value-input.tsx#L39)

Enum option list.

***

### errorMessage? \{#errormessage\}

```ts
errorMessage?: string;
```

Defined in: [packages/rxdb-model-react/src/query-builder/value-input/value-input.tsx:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/value-input/value-input.tsx#L45)

Validation error message (shown as a tooltip and error styling).

***

### fieldType? \{#fieldtype\}

```ts
fieldType?: string;
```

Defined in: [packages/rxdb-model-react/src/query-builder/value-input/value-input.tsx:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/value-input/value-input.tsx#L33)

Field type, defaults to `'string'`.

***

### onValueChange? \{#onvaluechange\}

```ts
onValueChange?: (value) => void;
```

Defined in: [packages/rxdb-model-react/src/query-builder/value-input/value-input.tsx:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/value-input/value-input.tsx#L47)

Value change callback.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `value` | `unknown` |

#### Returns

`void`

***

### onWhereChange? \{#onwherechange\}

```ts
onWhereChange?: (where) => void;
```

Defined in: [packages/rxdb-model-react/src/query-builder/value-input/value-input.tsx:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/value-input/value-input.tsx#L49)

Subquery change callback.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `where` | \| [`QueryBuilderRuleGroup`](QueryBuilderRuleGroup.md)&lt;`Record`&lt;`string`, `unknown`&gt;&gt; \| `undefined` |

#### Returns

`void`

***

### operator? \{#operator\}

```ts
operator?: string;
```

Defined in: [packages/rxdb-model-react/src/query-builder/value-input/value-input.tsx:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/value-input/value-input.tsx#L35)

Operator, defaults to `'='`.

***

### relationFields? \{#relationfields\}

```ts
relationFields?: FieldMetadata[];
```

Defined in: [packages/rxdb-model-react/src/query-builder/value-input/value-input.tsx:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/value-input/value-input.tsx#L41)

Target field list of a relation field (used for exists subqueries).

***

### value? \{#value\}

```ts
value?: unknown;
```

Defined in: [packages/rxdb-model-react/src/query-builder/value-input/value-input.tsx:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/value-input/value-input.tsx#L37)

Current value, defaults to `''`.

***

### where? \{#where\}

```ts
where?: QueryBuilderRuleGroup<Record<string, unknown>>;
```

Defined in: [packages/rxdb-model-react/src/query-builder/value-input/value-input.tsx:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/value-input/value-input.tsx#L43)

The where subquery of an exists rule.
