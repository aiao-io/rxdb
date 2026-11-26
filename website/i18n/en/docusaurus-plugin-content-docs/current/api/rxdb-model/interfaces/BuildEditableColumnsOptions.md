# BuildEditableColumnsOptions

Defined in: [packages/rxdb-model/src/entity-table/columns/build-editable-columns.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/columns/build-editable-columns.ts#L33)

Options for building editable columns

## Properties

### actionsTitle? \{#actionstitle\}

```ts
actionsTitle?: string;
```

Defined in: [packages/rxdb-model/src/entity-table/columns/build-editable-columns.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/columns/build-editable-columns.ts#L39)

Actions column title (default "Actions")

---

### createdAtTitle? \{#createdattitle\}

```ts
createdAtTitle?: string;
```

Defined in: [packages/rxdb-model/src/entity-table/columns/build-editable-columns.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/columns/build-editable-columns.ts#L45)

Created-at column title (default "Created at")

---

### deleteLabel? \{#deletelabel\}

```ts
deleteLabel?: string;
```

Defined in: [packages/rxdb-model/src/entity-table/columns/build-editable-columns.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/columns/build-editable-columns.ts#L41)

Delete button label (default "Delete")

---

### i18n? \{#i18n\}

```ts
i18n?: ModelI18n;
```

Defined in: [packages/rxdb-model/src/entity-table/columns/build-editable-columns.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/columns/build-editable-columns.ts#L35)

Component translation and formatting runtime.

---

### readOnly? \{#readonly\}

```ts
readOnly?: boolean;
```

Defined in: [packages/rxdb-model/src/entity-table/columns/build-editable-columns.ts:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/columns/build-editable-columns.ts#L49)

The instance the entity lives in is read-only (`rxdb.readOnly`): no column is editable and the actions column only shows view

---

### relatedItemsProviderFactory? \{#relateditemsproviderfactory\}

```ts
relatedItemsProviderFactory?: RelatedItemsProviderFactory;
```

Defined in: [packages/rxdb-model/src/entity-table/columns/build-editable-columns.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/columns/build-editable-columns.ts#L37)

Factory for related-entity candidate providers (returns a provider by foreign key field and related entity name)

---

### updatedAtTitle? \{#updatedattitle\}

```ts
updatedAtTitle?: string;
```

Defined in: [packages/rxdb-model/src/entity-table/columns/build-editable-columns.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/columns/build-editable-columns.ts#L47)

Updated-at column title (default "Updated at")

---

### viewLabel? \{#viewlabel\}

```ts
viewLabel?: string;
```

Defined in: [packages/rxdb-model/src/entity-table/columns/build-editable-columns.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/columns/build-editable-columns.ts#L43)

View button label (default "View")
