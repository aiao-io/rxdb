# EntityFormProps

Defined in: [packages/rxdb-model-react/src/entity-form/entity-form.tsx:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-form/entity-form.tsx#L27)

Props of [EntityForm](../functions/EntityForm.md).

## Properties

### data \{#data\}

```ts
data: EntityFormData;
```

Defined in: [packages/rxdb-model-react/src/entity-form/entity-form.tsx:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-form/entity-form.tsx#L31)

Form data (field name → value).

***

### fields \{#fields\}

```ts
fields: FormFieldConfig[];
```

Defined in: [packages/rxdb-model-react/src/entity-form/entity-form.tsx:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-form/entity-form.tsx#L29)

Form field configuration.

***

### mode? \{#mode\}

```ts
mode?: FormMode;
```

Defined in: [packages/rxdb-model-react/src/entity-form/entity-form.tsx:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-form/entity-form.tsx#L33)

Form mode (view / edit / create), defaults to `view`.

***

### onFieldChanged? \{#onfieldchanged\}

```ts
onFieldChanged?: (event) => void;
```

Defined in: [packages/rxdb-model-react/src/entity-form/entity-form.tsx:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-form/entity-form.tsx#L44)

Field value changed.

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

Defined in: [packages/rxdb-model-react/src/entity-form/entity-form.tsx:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-form/entity-form.tsx#L48)

Cancelled (local data resets to the most recent input).

#### Returns

`void`

***

### onFormSubmitted? \{#onformsubmitted\}

```ts
onFormSubmitted?: (data) => void;
```

Defined in: [packages/rxdb-model-react/src/entity-form/entity-form.tsx:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-form/entity-form.tsx#L46)

Submitted after validation passes.

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

Defined in: [packages/rxdb-model-react/src/entity-form/entity-form.tsx:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-form/entity-form.tsx#L50)

Validation failed (parse failure or submit validation failure).

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

Defined in: [packages/rxdb-model-react/src/entity-form/entity-form.tsx:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-form/entity-form.tsx#L40)

Related-entity candidate provider (data source of the relation-field dropdown).

#### Remarks

Candidates are cached per provider instance: pass in a new provider to recompute the dropdown when the candidate data changes
(`EntityList` gets a new one with each emission of the related list resource).

***

### showActions? \{#showactions\}

```ts
showActions?: boolean;
```

Defined in: [packages/rxdb-model-react/src/entity-form/entity-form.tsx:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-form/entity-form.tsx#L42)

Whether to render the save / cancel buttons, defaults to `true`.
