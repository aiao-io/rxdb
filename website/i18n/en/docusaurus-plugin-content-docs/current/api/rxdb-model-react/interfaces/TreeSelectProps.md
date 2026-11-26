# TreeSelectProps

Defined in: [packages/rxdb-model-react/src/query-builder/tree-select/tree-select.tsx:101](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/tree-select/tree-select.tsx#L101)

Props of [TreeSelect](../functions/TreeSelect.md).

## Properties

### minWidth? \{#minwidth\}

```ts
minWidth?: string;
```

Defined in: [packages/rxdb-model-react/src/query-builder/tree-select/tree-select.tsx:109](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/tree-select/tree-select.tsx#L109)

Minimum width of the trigger and the popover, defaults to `'14rem'`.

---

### nodes \{#nodes\}

```ts
nodes: FieldTreeNode[];
```

Defined in: [packages/rxdb-model-react/src/query-builder/tree-select/tree-select.tsx:103](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/tree-select/tree-select.tsx#L103)

Tree nodes.

---

### onSelectChange? \{#onselectchange\}

```ts
onSelectChange?: (value) => void;
```

Defined in: [packages/rxdb-model-react/src/query-builder/tree-select/tree-select.tsx:111](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/tree-select/tree-select.tsx#L111)

Selection callback.

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `value`   | `string` |

#### Returns

`void`

---

### placeholder? \{#placeholder\}

```ts
placeholder?: string;
```

Defined in: [packages/rxdb-model-react/src/query-builder/tree-select/tree-select.tsx:107](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/tree-select/tree-select.tsx#L107)

Placeholder text, defaults to `'Select'`.

---

### selected? \{#selected\}

```ts
selected?: string;
```

Defined in: [packages/rxdb-model-react/src/query-builder/tree-select/tree-select.tsx:105](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/tree-select/tree-select.tsx#L105)

Currently selected value.
