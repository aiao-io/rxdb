# QueryGroupProps

Defined in: [packages/rxdb-model-react/src/query-builder/query-group/query-group.tsx:137](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/query-group/query-group.tsx#L137)

Props of [QueryGroup](../functions/QueryGroup.md).

## Properties

### allowCollapse? \{#allowcollapse\}

```ts
allowCollapse?: boolean;
```

Defined in: [packages/rxdb-model-react/src/query-builder/query-group/query-group.tsx:151](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/query-group/query-group.tsx#L151)

Whether the group can be expanded/collapsed, defaults to `true`.

---

### depth? \{#depth\}

```ts
depth?: number;
```

Defined in: [packages/rxdb-model-react/src/query-builder/query-group/query-group.tsx:145](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/query-group/query-group.tsx#L145)

Nesting depth, defaults to `0`.

---

### dragDropHandler? \{#dragdrophandler\}

```ts
dragDropHandler?: QueryDragDropHandler;
```

Defined in: [packages/rxdb-model-react/src/query-builder/query-group/query-group.tsx:149](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/query-group/query-group.tsx#L149)

Drag state manager; when absent, the drag handle is not rendered.

---

### errors? \{#errors\}

```ts
errors?: ValidationError[];
```

Defined in: [packages/rxdb-model-react/src/query-builder/query-group/query-group.tsx:143](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/query-group/query-group.tsx#L143)

List of validation errors.

---

### fields \{#fields\}

```ts
fields: FieldMetadata[];
```

Defined in: [packages/rxdb-model-react/src/query-builder/query-group/query-group.tsx:141](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/query-group/query-group.tsx#L141)

Field list.

---

### group \{#group\}

```ts
group: UIRuleGroup;
```

Defined in: [packages/rxdb-model-react/src/query-builder/query-group/query-group.tsx:139](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/query-group/query-group.tsx#L139)

Rule group.

---

### maxDepth? \{#maxdepth\}

```ts
maxDepth?: number;
```

Defined in: [packages/rxdb-model-react/src/query-builder/query-group/query-group.tsx:147](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/query-group/query-group.tsx#L147)

Maximum nesting level, defaults to `5`.

---

### onAddGroup? \{#onaddgroup\}

```ts
onAddGroup?: (parentId) => void;
```

Defined in: [packages/rxdb-model-react/src/query-builder/query-group/query-group.tsx:155](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/query-group/query-group.tsx#L155)

Add a child group.

#### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `parentId` | `string` |

#### Returns

`void`

---

### onAddRule? \{#onaddrule\}

```ts
onAddRule?: (event) => void;
```

Defined in: [packages/rxdb-model-react/src/query-builder/query-group/query-group.tsx:153](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/query-group/query-group.tsx#L153)

Add a rule.

#### Parameters

| Parameter        | Type                                                                             |
| ---------------- | -------------------------------------------------------------------------------- |
| `event`          | \{ `parentId`: `string`; `rule`: `Omit`&lt;[`UIRule`](UIRule.md), `"id"`&gt;; \} |
| `event.parentId` | `string`                                                                         |
| `event.rule`     | `Omit`&lt;[`UIRule`](UIRule.md), `"id"`&gt;                                      |

#### Returns

`void`

---

### onRemoveItem? \{#onremoveitem\}

```ts
onRemoveItem?: (id) => void;
```

Defined in: [packages/rxdb-model-react/src/query-builder/query-group/query-group.tsx:157](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/query-group/query-group.tsx#L157)

Delete a rule or group.

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `id`      | `string` |

#### Returns

`void`

---

### onUpdateCombinator? \{#onupdatecombinator\}

```ts
onUpdateCombinator?: (event) => void;
```

Defined in: [packages/rxdb-model-react/src/query-builder/query-group/query-group.tsx:161](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/query-group/query-group.tsx#L161)

Update the combinator.

#### Parameters

| Parameter          | Type                                                   |
| ------------------ | ------------------------------------------------------ |
| `event`            | \{ `combinator`: `"and"` \| `"or"`; `id`: `string`; \} |
| `event.combinator` | `"and"` \| `"or"`                                      |
| `event.id`         | `string`                                               |

#### Returns

`void`

---

### onUpdateRule? \{#onupdaterule\}

```ts
onUpdateRule?: (event) => void;
```

Defined in: [packages/rxdb-model-react/src/query-builder/query-group/query-group.tsx:159](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/query-group/query-group.tsx#L159)

Update a rule.

#### Parameters

| Parameter       | Type                                                                     |
| --------------- | ------------------------------------------------------------------------ |
| `event`         | \{ `id`: `string`; `updates`: `Partial`&lt;[`UIRule`](UIRule.md)&gt;; \} |
| `event.id`      | `string`                                                                 |
| `event.updates` | `Partial`&lt;[`UIRule`](UIRule.md)&gt;                                   |

#### Returns

`void`
