# EntityFormController

Defined in: packages/rxdb-model/dist/entity-form/headless.d.ts:85

Shared state and actions for the form.

## Remarks

Instances can be used in any framework and Node environment; after `dispose` is called, consumers are no longer notified.

## Constructors

### Constructor

```ts
new EntityFormController(options): EntityFormController;
```

Defined in: packages/rxdb-model/dist/entity-form/headless.d.ts:89

#### Parameters

| Parameter | Type                                                                          |
| --------- | ----------------------------------------------------------------------------- |
| `options` | [`EntityFormControllerOptions`](../interfaces/EntityFormControllerOptions.md) |

#### Returns

`EntityFormController`

## Accessors

### snapshot \{#snapshot\}

#### Get Signature

```ts
get snapshot(): EntityFormSnapshot;
```

Defined in: packages/rxdb-model/dist/entity-form/headless.d.ts:88

The current immutable snapshot; every read returns a new data object.

##### Returns

[`EntityFormSnapshot`](../interfaces/EntityFormSnapshot.md)

## Methods

### cancel() \{#cancel\}

```ts
cancel(): EntityFormData;
```

Defined in: packages/rxdb-model/dist/entity-form/headless.d.ts:131

Restores the input of the most recent setData / setEntity and emits the cancel event.

#### Returns

[`EntityFormData`](../interfaces/EntityFormData.md)

---

### discardInput() \{#discardinput\}

```ts
discardInput(fieldName): void;
```

Defined in: packages/rxdb-model/dist/entity-form/headless.d.ts:127

Discards the field's input that has not passed parsing, keeping the most recent valid value.

#### Parameters

| Parameter   | Type     |
| ----------- | -------- |
| `fieldName` | `string` |

#### Returns

`void`

#### Remarks

Called by a control when it echoes the most recent valid value after a parse failure (e.g. a controlled input bound to `snapshot.data`);
do not call it from controls that keep the original input, where the parse error keeps blocking submission until the input is corrected.

---

### dispose() \{#dispose\}

```ts
dispose(): void;
```

Defined in: packages/rxdb-model/dist/entity-form/headless.d.ts:133

Removes subscriptions and blocks notifications from subsequent actions.

#### Returns

`void`

---

### getFieldState() \{#getfieldstate\}

```ts
getFieldState(fieldName):
  | EntityFormFieldSnapshot
  | undefined;
```

Defined in: packages/rxdb-model/dist/entity-form/headless.d.ts:91

Reads the render state of a single field.

#### Parameters

| Parameter   | Type     |
| ----------- | -------- |
| `fieldName` | `string` |

#### Returns

\| [`EntityFormFieldSnapshot`](../interfaces/EntityFormFieldSnapshot.md)
\| `undefined`

---

### setData() \{#setdata\}

```ts
setData(data): void;
```

Defined in: packages/rxdb-model/dist/entity-form/headless.d.ts:95

Replaces the host data and clears old input and errors.

#### Parameters

| Parameter | Type                                                |
| --------- | --------------------------------------------------- |
| `data`    | [`EntityFormData`](../interfaces/EntityFormData.md) |

#### Returns

`void`

---

### setEntity() \{#setentity\}

```ts
setEntity(entity): void;
```

Defined in: packages/rxdb-model/dist/entity-form/headless.d.ts:97

Converts the entity into form data and replaces the host data.

#### Parameters

| Parameter | Type                                |
| --------- | ----------------------------------- |
| `entity`  | `Record`&lt;`string`, `unknown`&gt; |

#### Returns

`void`

---

### setField() \{#setfield\}

```ts
setField(fieldName, rawValue):
  | {
  event: FormFieldChangeEvent;
  ok: true;
}
  | {
  ok: false;
  result: FormValidationResult;
};
```

Defined in: packages/rxdb-model/dist/entity-form/headless.d.ts:109

Parses and writes a field.

#### Parameters

| Parameter   | Type      |
| ----------- | --------- |
| `fieldName` | `string`  |
| `rawValue`  | `unknown` |

#### Returns

\| \{
`event`: [`FormFieldChangeEvent`](../interfaces/FormFieldChangeEvent.md);
`ok`: `true`;
\}
\| \{
`ok`: `false`;
`result`: [`FormValidationResult`](../interfaces/FormValidationResult.md);
\}

On success returns the normalized value; on failure keeps the most recent valid value; the failed `result` and the `validationErrors` published alongside it only contain the parse errors of this input,
read `snapshot.errors` for the full errors.

---

### setFields() \{#setfields\}

```ts
setFields(fields): void;
```

Defined in: packages/rxdb-model/dist/entity-form/headless.d.ts:99

Updates the field metadata and cleans up errors that cannot be mapped to the new fields.

#### Parameters

| Parameter | Type                                                             |
| --------- | ---------------------------------------------------------------- |
| `fields`  | readonly [`FormFieldConfig`](../interfaces/FormFieldConfig.md)[] |

#### Returns

`void`

---

### setMode() \{#setmode\}

```ts
setMode(mode): void;
```

Defined in: packages/rxdb-model/dist/entity-form/headless.d.ts:103

Switches the mode; view mode blocks all field writes and submission.

#### Parameters

| Parameter | Type                                      |
| --------- | ----------------------------------------- |
| `mode`    | [`FormMode`](../type-aliases/FormMode.md) |

#### Returns

`void`

---

### setRelatedEntityProvider() \{#setrelatedentityprovider\}

```ts
setRelatedEntityProvider(provider): void;
```

Defined in: packages/rxdb-model/dist/entity-form/headless.d.ts:101

Updates the relation candidate provider and refreshes the read-only display values.

#### Parameters

| Parameter  | Type                                                                                |
| ---------- | ----------------------------------------------------------------------------------- |
| `provider` | \| [`RelatedEntityProvider`](../interfaces/RelatedEntityProvider.md) \| `undefined` |

#### Returns

`void`

---

### submit() \{#submit\}

```ts
submit(): EntityFormSubmitResult;
```

Defined in: packages/rxdb-model/dist/entity-form/headless.d.ts:129

Validates and returns the data plus the change set relative to the initial entity; uncorrected parse errors also make the submission fail.

#### Returns

[`EntityFormSubmitResult`](../type-aliases/EntityFormSubmitResult.md)

---

### subscribe() \{#subscribe\}

```ts
subscribe(listener): () => void;
```

Defined in: packages/rxdb-model/dist/entity-form/headless.d.ts:93

Subscribes to state and action events, returning a cleanup function safe to call repeatedly.

#### Parameters

| Parameter  | Type       |
| ---------- | ---------- |
| `listener` | `Listener` |

#### Returns

() => `void`

---

### validate() \{#validate\}

```ts
validate(): FormValidationResult;
```

Defined in: packages/rxdb-model/dist/entity-form/headless.d.ts:121

Validates the current data without submission side effects.

#### Returns

[`FormValidationResult`](../interfaces/FormValidationResult.md)

#### Remarks

Uncorrected parse errors are counted as well: they are only cleared when the same field receives a valid value, `discardInput` is called, the form is cancelled, or the host resets;
re-validating the most recent valid value cannot prove the input has been corrected.
