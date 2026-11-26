# FieldSelectorProps

Defined in: [packages/rxdb-model-react/src/query-builder/field-selector/field-selector.tsx:16](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/field-selector/field-selector.tsx#L16)

Props of [FieldSelector](../functions/FieldSelector.md).

## Properties

### fields \{#fields\}

```ts
fields: FieldMetadata[];
```

Defined in: [packages/rxdb-model-react/src/query-builder/field-selector/field-selector.tsx:18](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/field-selector/field-selector.tsx#L18)

List of available fields.

---

### onFieldChange? \{#onfieldchange\}

```ts
onFieldChange?: (field) => void;
```

Defined in: [packages/rxdb-model-react/src/query-builder/field-selector/field-selector.tsx:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/field-selector/field-selector.tsx#L24)

Selection callback.

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `field`   | `string` |

#### Returns

`void`

---

### placeholder? \{#placeholder\}

```ts
placeholder?: string;
```

Defined in: [packages/rxdb-model-react/src/query-builder/field-selector/field-selector.tsx:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/field-selector/field-selector.tsx#L22)

Placeholder text; defaults to 'Select field'.

---

### selectedField? \{#selectedfield\}

```ts
selectedField?: string;
```

Defined in: [packages/rxdb-model-react/src/query-builder/field-selector/field-selector.tsx:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/field-selector/field-selector.tsx#L20)

The currently selected field.
