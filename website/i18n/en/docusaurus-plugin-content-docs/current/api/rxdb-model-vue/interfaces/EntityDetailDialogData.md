# EntityDetailDialogData

Defined in: [packages/rxdb-model-vue/src/entity-detail/entity-detail-types.ts:9](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-vue/src/entity-detail/entity-detail-types.ts#L9)

Data structure passed into the detail dialog (aligned with `EntityDetailDialogData` of the Angular CDK Dialog).

In Vue, the dialog host spreads these fields into the props of [EntityDetail](../variables/EntityList.md).

## Properties

### creationChain? \{#creationchain\}

```ts
creationChain?: string[];
```

Defined in: [packages/rxdb-model-vue/src/entity-detail/entity-detail-types.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-vue/src/entity-detail/entity-detail-types.ts#L29)

Entity types in the creation chain (namespace:name), used to block circular creation

***

### delegateSave? \{#delegatesave\}

```ts
delegateSave?: boolean;
```

Defined in: [packages/rxdb-model-vue/src/entity-detail/entity-detail-types.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-vue/src/entity-detail/entity-detail-types.ts#L27)

Delegated save: do not create a draft entity; only emit formSubmitted and let the caller handle it

***

### editChain? \{#editchain\}

```ts
editChain?: string[];
```

Defined in: [packages/rxdb-model-vue/src/entity-detail/entity-detail-types.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-vue/src/entity-detail/entity-detail-types.ts#L21)

Stack of record ids of already-open detail dialogs (including the current record); the relation tab list uses it to block infinite nesting

***

### entityId? \{#entityid\}

```ts
entityId?: string;
```

Defined in: [packages/rxdb-model-vue/src/entity-detail/entity-detail-types.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-vue/src/entity-detail/entity-detail-types.ts#L19)

Edit mode: loads the entity instance from the Repository by id; when absent, the form data is passed through as-is

***

### fixedFormData? \{#fixedformdata\}

```ts
fixedFormData?: EntityFormData;
```

Defined in: [packages/rxdb-model-vue/src/entity-detail/entity-detail-types.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-vue/src/entity-detail/entity-detail-types.ts#L25)

Pre-filled foreign key data (not editable), used for cascading creation scenarios

***

### formData \{#formdata\}

```ts
formData: EntityFormData;
```

Defined in: [packages/rxdb-model-vue/src/entity-detail/entity-detail-types.ts:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-vue/src/entity-detail/entity-detail-types.ts#L15)

Form data

***

### formFields \{#formfields\}

```ts
formFields: FormFieldConfig[];
```

Defined in: [packages/rxdb-model-vue/src/entity-detail/entity-detail-types.ts:13](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-vue/src/entity-detail/entity-detail-types.ts#L13)

Form field configuration

***

### formMode \{#formmode\}

```ts
formMode: FormMode;
```

Defined in: [packages/rxdb-model-vue/src/entity-detail/entity-detail-types.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-vue/src/entity-detail/entity-detail-types.ts#L17)

Form mode

***

### metadata \{#metadata\}

```ts
metadata: EntityMetadata;
```

Defined in: [packages/rxdb-model-vue/src/entity-detail/entity-detail-types.ts:11](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-vue/src/entity-detail/entity-detail-types.ts#L11)

Entity metadata

***

### relatedEntityProvider? \{#relatedentityprovider\}

```ts
relatedEntityProvider?: RelatedEntityProvider;
```

Defined in: [packages/rxdb-model-vue/src/entity-detail/entity-detail-types.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-vue/src/entity-detail/entity-detail-types.ts#L23)

Provider of related entity candidates
