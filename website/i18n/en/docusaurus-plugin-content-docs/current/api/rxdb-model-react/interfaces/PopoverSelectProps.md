# PopoverSelectProps

Defined in: [packages/rxdb-model-react/src/query-builder/popover-select/popover-select.tsx:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/popover-select/popover-select.tsx#L25)

Props of [PopoverSelect](../functions/PopoverSelect.md).

## Properties

### minWidth? \{#minwidth\}

```ts
minWidth?: string;
```

Defined in: [packages/rxdb-model-react/src/query-builder/popover-select/popover-select.tsx:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/popover-select/popover-select.tsx#L33)

Minimum width of the trigger and the popover, defaults to `'8rem'`.

---

### onSelectChange? \{#onselectchange\}

```ts
onSelectChange?: (value) => void;
```

Defined in: [packages/rxdb-model-react/src/query-builder/popover-select/popover-select.tsx:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/popover-select/popover-select.tsx#L35)

Selection callback.

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `value`   | `string` |

#### Returns

`void`

---

### options \{#options\}

```ts
options: readonly PopoverSelectOption[];
```

Defined in: [packages/rxdb-model-react/src/query-builder/popover-select/popover-select.tsx:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/popover-select/popover-select.tsx#L27)

Option list.

---

### placeholder? \{#placeholder\}

```ts
placeholder?: string;
```

Defined in: [packages/rxdb-model-react/src/query-builder/popover-select/popover-select.tsx:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/popover-select/popover-select.tsx#L31)

Placeholder text (shown when nothing is selected or the selected value is not among the options), defaults to `'Select'`.

---

### selected? \{#selected\}

```ts
selected?: string;
```

Defined in: [packages/rxdb-model-react/src/query-builder/popover-select/popover-select.tsx:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/popover-select/popover-select.tsx#L29)

Currently selected value.
