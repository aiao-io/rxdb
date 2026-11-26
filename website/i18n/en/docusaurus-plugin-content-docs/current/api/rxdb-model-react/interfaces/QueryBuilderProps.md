---
sidebar_label: "QueryBuilderProps⟨T⟩"
---

# QueryBuilderProps`<T>`

Defined in: [packages/rxdb-model-react/src/query-builder/query-builder/query-builder.tsx:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/query-builder/query-builder.tsx#L39)

Props of [QueryBuilder](../functions/QueryBuilder.md).

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` *extends* `object` | `Record`&lt;`string`, `unknown`&gt; |

## Properties

### enableCollapse? \{#enablecollapse\}

```ts
enableCollapse?: boolean;
```

Defined in: [packages/rxdb-model-react/src/query-builder/query-builder/query-builder.tsx:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/query-builder/query-builder.tsx#L53)

Whether to enable group expand/collapse, defaults to `true`.

***

### enableDrag? \{#enabledrag\}

```ts
enableDrag?: boolean;
```

Defined in: [packages/rxdb-model-react/src/query-builder/query-builder/query-builder.tsx:51](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/query-builder/query-builder.tsx#L51)

Whether to enable drag reordering, defaults to `true`.

***

### fields? \{#fields\}

```ts
fields?: FieldMetadata[];
```

Defined in: [packages/rxdb-model-react/src/query-builder/query-builder/query-builder.tsx:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/query-builder/query-builder.tsx#L43)

Field list (passed in directly, takes precedence over schema).

***

### height? \{#height\}

```ts
height?: string;
```

Defined in: [packages/rxdb-model-react/src/query-builder/query-builder/query-builder.tsx:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/query-builder/query-builder.tsx#L49)

Maximum height of the content area (scrolls beyond it), accepts any CSS length value such as `'400px'` or `'50vh'`, defaults to `'80vh'`.

***

### initialQuery? \{#initialquery\}

```ts
initialQuery?: RxDBQueryOutput<T>;
```

Defined in: [packages/rxdb-model-react/src/query-builder/query-builder/query-builder.tsx:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/query-builder/query-builder.tsx#L45)

Initial query condition (optional).

***

### maxDepth? \{#maxdepth\}

```ts
maxDepth?: number;
```

Defined in: [packages/rxdb-model-react/src/query-builder/query-builder/query-builder.tsx:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/query-builder/query-builder.tsx#L47)

Maximum nesting level, defaults to `5`.

***

### onQueryChange? \{#onquerychange\}

```ts
onQueryChange?: (query) => void;
```

Defined in: [packages/rxdb-model-react/src/query-builder/query-builder/query-builder.tsx:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/query-builder/query-builder.tsx#L55)

Query condition change event.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `query` | [`RxDBQueryOutput`](RxDBQueryOutput.md)&lt;`T`&gt; |

#### Returns

`void`

***

### onValidationChange? \{#onvalidationchange\}

```ts
onValidationChange?: (result) => void;
```

Defined in: [packages/rxdb-model-react/src/query-builder/query-builder/query-builder.tsx:57](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/query-builder/query-builder.tsx#L57)

Validation state change event.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `result` | [`ValidationResult`](ValidationResult.md) |

#### Returns

`void`

***

### schema? \{#schema\}

```ts
schema?: SchemaInfo;
```

Defined in: [packages/rxdb-model-react/src/query-builder/query-builder/query-builder.tsx:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/query-builder/query-builder.tsx#L41)

Schema information, containing field definitions.
