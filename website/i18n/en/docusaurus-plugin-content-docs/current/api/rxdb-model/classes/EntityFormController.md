# EntityFormController

Defined in: [packages/rxdb-model/src/entity-form/headless.ts:113](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/headless.ts#L113)

Shared state and actions of the form.

## Remarks

The instance can be used in any framework and in Node environments; after calling `dispose` the consumer is no longer notified.

## Constructors

### Constructor

```ts
new EntityFormController(options): EntityFormController;
```

Defined in: [packages/rxdb-model/src/entity-form/headless.ts:132](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/headless.ts#L132)

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

Defined in: [packages/rxdb-model/src/entity-form/headless.ts:128](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/headless.ts#L128)

The current immutable snapshot; every read returns a new data object.

##### Returns

[`EntityFormSnapshot`](../interfaces/EntityFormSnapshot.md)

## Methods

### cancel() \{#cancel\}

```ts
cancel(): EntityFormData;
```

Defined in: [packages/rxdb-model/src/entity-form/headless.ts:288](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/headless.ts#L288)

Restores the most recent setData / setEntity input and emits a cancel event.

#### Returns

[`EntityFormData`](../interfaces/EntityFormData.md)

---

### discardInput() \{#discardinput\}

```ts
discardInput(fieldName): void;
```

Defined in: [packages/rxdb-model/src/entity-form/headless.ts:266](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/headless.ts#L266)

Discards the field's input that has not passed parsing, keeping the most recent valid value.

#### Parameters

| Parameter   | Type     |
| ----------- | -------- |
| `fieldName` | `string` |

#### Returns

`void`

#### Remarks

Called by controls when they echo the most recent valid value back after a parse failure (e.g. a controlled input bound to `snapshot.data`);
controls that keep the original input must not call this — the parse error keeps blocking submission until the input is corrected.

---

### dispose() \{#dispose\}

```ts
dispose(): void;
```

Defined in: [packages/rxdb-model/src/entity-form/headless.ts:299](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/headless.ts#L299)

Unsubscribes and blocks subsequent action notifications.

#### Returns

`void`

---

### getFieldState() \{#getfieldstate\}

```ts
getFieldState(fieldName):
  | EntityFormFieldSnapshot
  | undefined;
```

Defined in: [packages/rxdb-model/src/entity-form/headless.ts:150](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/headless.ts#L150)

Reads the rendering state of a single field.

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

Defined in: [packages/rxdb-model/src/entity-form/headless.ts:162](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/headless.ts#L162)

Replaces the host data, clearing the old input and errors.

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

Defined in: [packages/rxdb-model/src/entity-form/headless.ts:173](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/headless.ts#L173)

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

Defined in: [packages/rxdb-model/src/entity-form/headless.ts:215](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/headless.ts#L215)

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

On success returns the normalized value, on failure keeps the most recent valid value; the failure `result`, like the `validationErrors` published along with it, contains only the parse errors of this input.
For full errors read `snapshot.errors`.

---

### setFields() \{#setfields\}

```ts
setFields(fields): void;
```

Defined in: [packages/rxdb-model/src/entity-form/headless.ts:178](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/headless.ts#L178)

Updates the field metadata and clears errors that cannot be mapped to the new fields.

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

Defined in: [packages/rxdb-model/src/entity-form/headless.ts:201](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/headless.ts#L201)

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

Defined in: [packages/rxdb-model/src/entity-form/headless.ts:192](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/headless.ts#L192)

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

Defined in: [packages/rxdb-model/src/entity-form/headless.ts:273](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/headless.ts#L273)

Validates and returns the data plus the change set relative to the initial entity; uncorrected parse errors also make submission fail.

#### Returns

[`EntityFormSubmitResult`](../type-aliases/EntityFormSubmitResult.md)

---

### subscribe() \{#subscribe\}

```ts
subscribe(listener): () => void;
```

Defined in: [packages/rxdb-model/src/entity-form/headless.ts:155](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/headless.ts#L155)

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

Defined in: [packages/rxdb-model/src/entity-form/headless.ts:256](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/headless.ts#L256)

Validates the current data without submission side effects.

#### Returns

[`FormValidationResult`](../interfaces/FormValidationResult.md)

#### Remarks

Uncorrected parse errors are included: they are only cleared when the same field receives a valid value, `discardInput`, a cancel, or a host reset.
Re-validating the most recent valid value cannot prove the input has been corrected.
