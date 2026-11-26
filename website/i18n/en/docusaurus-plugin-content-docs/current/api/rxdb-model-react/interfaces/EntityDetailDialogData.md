# EntityDetailDialogData

Defined in: [packages/rxdb-model-react/src/entity-detail/entity-detail.tsx:97](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-detail/entity-detail.tsx#L97)

Data structure passed into the CDK Dialog (on the React side = the props of EntityDetail).

## Properties

### creationChain? \{#creationchain\}

```ts
creationChain?: string[];
```

Defined in: [packages/rxdb-model-react/src/entity-detail/entity-detail.tsx:113](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-detail/entity-detail.tsx#L113)

Entity types in the creation chain (namespace:name), used to block circular creation

***

### delegateSave? \{#delegatesave\}

```ts
delegateSave?: boolean;
```

Defined in: [packages/rxdb-model-react/src/entity-detail/entity-detail.tsx:111](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-detail/entity-detail.tsx#L111)

Delegate saving: no draft entity is created, only emit formSubmitted for the caller to handle

***

### editChain? \{#editchain\}

```ts
editChain?: string[];
```

Defined in: [packages/rxdb-model-react/src/entity-detail/entity-detail.tsx:105](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-detail/entity-detail.tsx#L105)

Stack of record ids with detail dialogs already open (including the current record); the relation tab list blocks infinite nesting based on this

***

### entityId? \{#entityid\}

```ts
entityId?: string;
```

Defined in: [packages/rxdb-model-react/src/entity-detail/entity-detail.tsx:103](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-detail/entity-detail.tsx#L103)

Edit mode: loads the entity instance from the Repository by id; when absent, the form data is passed through as-is

***

### fixedFormData? \{#fixedformdata\}

```ts
fixedFormData?: EntityFormData;
```

Defined in: [packages/rxdb-model-react/src/entity-detail/entity-detail.tsx:109](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-detail/entity-detail.tsx#L109)

Pre-filled foreign-key data (not editable), for cascade-create scenarios

***

### formData \{#formdata\}

```ts
formData: EntityFormData;
```

Defined in: [packages/rxdb-model-react/src/entity-detail/entity-detail.tsx:100](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-detail/entity-detail.tsx#L100)

***

### formFields \{#formfields\}

```ts
formFields: FormFieldConfig[];
```

Defined in: [packages/rxdb-model-react/src/entity-detail/entity-detail.tsx:99](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-detail/entity-detail.tsx#L99)

***

### formMode \{#formmode\}

```ts
formMode: FormMode;
```

Defined in: [packages/rxdb-model-react/src/entity-detail/entity-detail.tsx:101](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-detail/entity-detail.tsx#L101)

***

### metadata \{#metadata\}

```ts
metadata: EntityMetadata;
```

Defined in: [packages/rxdb-model-react/src/entity-detail/entity-detail.tsx:98](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-detail/entity-detail.tsx#L98)

***

### relatedEntityProvider? \{#relatedentityprovider\}

```ts
relatedEntityProvider?: RelatedEntityProvider;
```

Defined in: [packages/rxdb-model-react/src/entity-detail/entity-detail.tsx:107](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-detail/entity-detail.tsx#L107)

Candidate source for the relation-field dropdown; candidates are recomputed only when a new provider is passed in (see the prop of the same name on `EntityForm`)
