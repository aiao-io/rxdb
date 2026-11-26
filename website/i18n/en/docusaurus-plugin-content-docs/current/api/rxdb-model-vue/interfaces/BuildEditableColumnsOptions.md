# BuildEditableColumnsOptions

Defined in: packages/rxdb-model/dist/entity-table/columns/build-editable-columns.d.ts:13

Options for building editable columns

## Properties

### actionsTitle? \{#actionstitle\}

```ts
actionsTitle?: string;
```

Defined in: packages/rxdb-model/dist/entity-table/columns/build-editable-columns.d.ts:19

Actions column title (defaults to "Actions")

---

### createdAtTitle? \{#createdattitle\}

```ts
createdAtTitle?: string;
```

Defined in: packages/rxdb-model/dist/entity-table/columns/build-editable-columns.d.ts:25

Created-at column title (defaults to "Created at")

---

### deleteLabel? \{#deletelabel\}

```ts
deleteLabel?: string;
```

Defined in: packages/rxdb-model/dist/entity-table/columns/build-editable-columns.d.ts:21

Delete button text (defaults to "Delete")

---

### i18n? \{#i18n\}

```ts
i18n?: ModelI18n;
```

Defined in: packages/rxdb-model/dist/entity-table/columns/build-editable-columns.d.ts:15

Component translation and formatting runtime.

---

### readOnly? \{#readonly\}

```ts
readOnly?: boolean;
```

Defined in: packages/rxdb-model/dist/entity-table/columns/build-editable-columns.d.ts:29

The instance the entity lives in is read-only (`rxdb.readOnly`): all columns are non-editable and the actions column only keeps View

---

### relatedItemsProviderFactory? \{#relateditemsproviderfactory\}

```ts
relatedItemsProviderFactory?: RelatedItemsProviderFactory;
```

Defined in: packages/rxdb-model/dist/entity-table/columns/build-editable-columns.d.ts:17

Factory of related entity candidate providers (returns a provider per foreign key field and related entity name)

---

### updatedAtTitle? \{#updatedattitle\}

```ts
updatedAtTitle?: string;
```

Defined in: packages/rxdb-model/dist/entity-table/columns/build-editable-columns.d.ts:27

Updated-at column title (defaults to "Updated at")

---

### viewLabel? \{#viewlabel\}

```ts
viewLabel?: string;
```

Defined in: packages/rxdb-model/dist/entity-table/columns/build-editable-columns.d.ts:23

View button text (defaults to "View")
