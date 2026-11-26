# ListViewState

Defined in: [packages/rxdb-model/src/entity-list/list-view.ts:9](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/list-view.ts#L9)

Field configuration, query ordering, and single-field grouping of the entity list.

## Properties

### fieldOrder \{#fieldorder\}

```ts
fieldOrder: string[];
```

Defined in: [packages/rxdb-model/src/entity-list/list-view.ts:11](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/list-view.ts#L11)

The user-specified field order; the remaining fields are appended in model declaration order.

---

### groupBy \{#groupby\}

```ts
groupBy: string | null;
```

Defined in: [packages/rxdb-model/src/entity-list/list-view.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/list-view.ts#L17)

The grouping field; null means a flat display.

---

### hiddenFields \{#hiddenfields\}

```ts
hiddenFields: string[];
```

Defined in: [packages/rxdb-model/src/entity-list/list-view.ts:13](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/list-view.ts#L13)

The hidden data fields; the actions column and selection column are always kept.

---

### sorts \{#sorts\}

```ts
sorts: (OrderBy < string) > [];
```

Defined in: [packages/rxdb-model/src/entity-list/list-view.ts:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/list-view.ts#L15)

The query sort rules ordered by priority.
