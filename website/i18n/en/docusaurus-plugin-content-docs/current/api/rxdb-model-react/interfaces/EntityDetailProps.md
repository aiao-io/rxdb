# EntityDetailProps

Defined in: [packages/rxdb-model-react/src/entity-detail/entity-detail.tsx:117](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-detail/entity-detail.tsx#L117)

Props of [EntityDetail](../functions/EntityDetail.md) (dialog data + route input + event callbacks).

## Extends

- `Partial`&lt;[`EntityDetailDialogData`](EntityDetailDialogData.md)&gt;

## Properties

### creationChain? \{#creationchain\}

```ts
creationChain?: string[];
```

Defined in: [packages/rxdb-model-react/src/entity-detail/entity-detail.tsx:113](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-detail/entity-detail.tsx#L113)

Entity types in the creation chain (namespace:name), used to block circular creation

#### Inherited from

[`EntityDetailDialogData`](EntityDetailDialogData.md).[`creationChain`](EntityDetailDialogData.md#creationchain)

***

### delegateSave? \{#delegatesave\}

```ts
delegateSave?: boolean;
```

Defined in: [packages/rxdb-model-react/src/entity-detail/entity-detail.tsx:111](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-detail/entity-detail.tsx#L111)

Delegate saving: no draft entity is created, only emit formSubmitted for the caller to handle

#### Inherited from

[`EntityDetailDialogData`](EntityDetailDialogData.md).[`delegateSave`](EntityDetailDialogData.md#delegatesave)

***

### editChain? \{#editchain\}

```ts
editChain?: string[];
```

Defined in: [packages/rxdb-model-react/src/entity-detail/entity-detail.tsx:105](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-detail/entity-detail.tsx#L105)

Stack of record ids with detail dialogs already open (including the current record); the relation tab list blocks infinite nesting based on this

#### Inherited from

[`EntityDetailDialogData`](EntityDetailDialogData.md).[`editChain`](EntityDetailDialogData.md#editchain)

***

### entityId? \{#entityid\}

```ts
entityId?: string;
```

Defined in: [packages/rxdb-model-react/src/entity-detail/entity-detail.tsx:103](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-detail/entity-detail.tsx#L103)

Edit mode: loads the entity instance from the Repository by id; when absent, the form data is passed through as-is

#### Inherited from

[`EntityDetailDialogData`](EntityDetailDialogData.md).[`entityId`](EntityDetailDialogData.md#entityid)

***

### fixedFormData? \{#fixedformdata\}

```ts
fixedFormData?: EntityFormData;
```

Defined in: [packages/rxdb-model-react/src/entity-detail/entity-detail.tsx:109](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-detail/entity-detail.tsx#L109)

Pre-filled foreign-key data (not editable), for cascade-create scenarios

#### Inherited from

[`EntityDetailDialogData`](EntityDetailDialogData.md).[`fixedFormData`](EntityDetailDialogData.md#fixedformdata)

***

### formData? \{#formdata\}

```ts
formData?: EntityFormData;
```

Defined in: [packages/rxdb-model-react/src/entity-detail/entity-detail.tsx:100](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-detail/entity-detail.tsx#L100)

#### Inherited from

[`EntityDetailDialogData`](EntityDetailDialogData.md).[`formData`](EntityDetailDialogData.md#formdata)

***

### formFields? \{#formfields\}

```ts
formFields?: FormFieldConfig[];
```

Defined in: [packages/rxdb-model-react/src/entity-detail/entity-detail.tsx:99](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-detail/entity-detail.tsx#L99)

#### Inherited from

[`EntityDetailDialogData`](EntityDetailDialogData.md).[`formFields`](EntityDetailDialogData.md#formfields)

***

### formMode? \{#formmode\}

```ts
formMode?: FormMode;
```

Defined in: [packages/rxdb-model-react/src/entity-detail/entity-detail.tsx:101](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-detail/entity-detail.tsx#L101)

#### Inherited from

[`EntityDetailDialogData`](EntityDetailDialogData.md).[`formMode`](EntityDetailDialogData.md#formmode)

***

### metadata? \{#metadata\}

```ts
metadata?: Readonly<EntityMetadataType>;
```

Defined in: [packages/rxdb-model-react/src/entity-detail/entity-detail.tsx:98](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-detail/entity-detail.tsx#L98)

#### Inherited from

[`EntityDetailDialogData`](EntityDetailDialogData.md).[`metadata`](EntityDetailDialogData.md#metadata)

***

### name? \{#name\}

```ts
name?: string;
```

Defined in: [packages/rxdb-model-react/src/entity-detail/entity-detail.tsx:121](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-detail/entity-detail.tsx#L121)

Entity name (route input channel).

***

### namespace? \{#namespace\}

```ts
namespace?: string;
```

Defined in: [packages/rxdb-model-react/src/entity-detail/entity-detail.tsx:119](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-detail/entity-detail.tsx#L119)

Entity namespace (route input channel; mutually exclusive with metadata).

***

### onFieldChanged? \{#onfieldchanged\}

```ts
onFieldChanged?: (event) => void;
```

Defined in: [packages/rxdb-model-react/src/entity-detail/entity-detail.tsx:127](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-detail/entity-detail.tsx#L127)

Field changed.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `event` | [`FormFieldChangeEvent`](FormFieldChangeEvent.md) |

#### Returns

`void`

***

### onFormCancelled? \{#onformcancelled\}

```ts
onFormCancelled?: () => void;
```

Defined in: [packages/rxdb-model-react/src/entity-detail/entity-detail.tsx:125](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-detail/entity-detail.tsx#L125)

Form cancelled.

#### Returns

`void`

***

### onFormSubmitted? \{#onformsubmitted\}

```ts
onFormSubmitted?: (data) => void;
```

Defined in: [packages/rxdb-model-react/src/entity-detail/entity-detail.tsx:123](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-detail/entity-detail.tsx#L123)

Form submitted.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `data` | [`EntityFormData`](EntityFormData.md) |

#### Returns

`void`

***

### onValidationErrors? \{#onvalidationerrors\}

```ts
onValidationErrors?: (result) => void;
```

Defined in: [packages/rxdb-model-react/src/entity-detail/entity-detail.tsx:129](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-detail/entity-detail.tsx#L129)

Validation failed.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `result` | [`FormValidationResult`](FormValidationResult.md) |

#### Returns

`void`

***

### relatedEntityProvider? \{#relatedentityprovider\}

```ts
relatedEntityProvider?: RelatedEntityProvider;
```

Defined in: [packages/rxdb-model-react/src/entity-detail/entity-detail.tsx:107](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-detail/entity-detail.tsx#L107)

Candidate source for the relation-field dropdown; candidates are recomputed only when a new provider is passed in (see the prop of the same name on `EntityForm`)

#### Inherited from

[`EntityDetailDialogData`](EntityDetailDialogData.md).[`relatedEntityProvider`](EntityDetailDialogData.md#relatedentityprovider)
