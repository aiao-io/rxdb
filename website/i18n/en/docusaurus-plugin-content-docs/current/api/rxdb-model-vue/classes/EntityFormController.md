# EntityFormController

Defined in: packages/rxdb-model/dist/entity-form/headless.d.ts:85

Shared state and actions for the form.

## Remarks

Instances can be used in any framework and in Node environments; consumers are no longer notified after `dispose` is called.

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

The current immutable snapshot; each read returns a new data object.

##### Returns

[`EntityFormSnapshot`](../interfaces/EntityFormSnapshot.md)

## Methods

### cancel() \{#cancel\}

```ts
cancel(): EntityFormData;
```

Defined in: packages/rxdb-model/dist/entity-form/headless.d.ts:131

Restores the most recent setData / setEntity input and emits a cancel event.

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

Call it when a control echoes the most recent valid value after a parse failure (e.g. a controlled input bound to `snapshot.data`);
controls that keep the raw input should not call it — parse errors keep blocking submission until the input is corrected.

---

### dispose() \{#dispose\}

```ts
dispose(): void;
```

Defined in: packages/rxdb-model/dist/entity-form/headless.d.ts:133

Releases subscriptions and blocks subsequent action notifications.

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

Reads a single field's rendering state.

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

Replaces the host data and clears old inputs and errors.

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

Converts the entity into form data, then replaces the host data.

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

Returns the normalized value on success; on failure keeps the most recent valid value; like the `validationErrors` published with it, the failure `result` contains only this input's parse errors —
read `snapshot.errors` for the full errors.

---

### setFields() \{#setfields\}

```ts
setFields(fields): void;
```

Defined in: packages/rxdb-model/dist/entity-form/headless.d.ts:99

Updates field metadata and clears errors that cannot be mapped to the new fields.

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

Updates the relation candidate provider and refreshes read-only display values.

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

Validates and returns the data plus the change set relative to the initial entity; un-corrected parse errors also make submission fail.

#### Returns

[`EntityFormSubmitResult`](../type-aliases/EntityFormSubmitResult.md)

---

### subscribe() \{#subscribe\}

```ts
subscribe(listener): () => void;
```

Defined in: packages/rxdb-model/dist/entity-form/headless.d.ts:93

Subscribes to state and action events, returning a cleanup function that is safe to call repeatedly.

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

Un-corrected parse errors are included: they are only cleared when the same field receives a valid value, `discardInput`, cancel or a host reset —
re-validating the most recent valid value does not prove the input was corrected.
