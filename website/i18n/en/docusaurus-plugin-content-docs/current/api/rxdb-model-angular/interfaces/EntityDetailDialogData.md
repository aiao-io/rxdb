# EntityDetailDialogData

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L45)

The data structure passed into the CDK Dialog

## Properties

### creationChain? \{#creationchain\}

```ts
creationChain?: string[];
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L60)

Entity types in the creation chain (namespace:name), used to break circular creation

***

### delegateSave? \{#delegatesave\}

```ts
delegateSave?: boolean;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L58)

Delegated save: no draft entity is created; only emit formSubmitted and let the caller handle it

***

### editChain? \{#editchain\}

```ts
editChain?: string[];
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L53)

Stack of record ids of the detail dialogs already open (including the current record); the relation tab list uses it to prevent infinite nesting

***

### entityId? \{#entityid\}

```ts
entityId?: string;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:51](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L51)

Edit mode: loads the entity instance from the Repository by id; when omitted, the form data is passed through as-is

***

### fixedFormData? \{#fixedformdata\}

```ts
fixedFormData?: EntityFormData;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:56](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L56)

Pre-filled foreign key data (not editable), for cascading create scenarios

***

### formData \{#formdata\}

```ts
formData: EntityFormData;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L48)

***

### formFields \{#formfields\}

```ts
formFields: FormFieldConfig[];
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L47)

***

### formMode \{#formmode\}

```ts
formMode: FormMode;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L49)

***

### metadata \{#metadata\}

```ts
metadata: EntityMetadata;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L46)

***

### relatedEntityProvider? \{#relatedentityprovider\}

```ts
relatedEntityProvider?: RelatedEntityProvider;
```

Defined in: [packages/rxdb-model-angular/src/entity-detail/entity-detail.ts:54](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/entity-detail/entity-detail.ts#L54)
