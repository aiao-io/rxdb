# EntityFormEvent

```ts
type EntityFormEvent = 
  | {
  event: FormFieldChangeEvent;
  type: "fieldChanged";
}
  | {
  result: FormValidationResult;
  type: "validationErrors";
}
  | {
  data: EntityFormData;
  type: "reset";
}
  | {
  data: EntityFormData;
  type: "submitted";
}
  | {
  data: EntityFormData;
  type: "cancelled";
};
```

Defined in: [packages/rxdb-model/src/entity-form/headless.ts:63](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/headless.ts#L63)

Reason for a form state change.

## Remarks

`validationErrors` only describes the parse failure of this `setField` input, consistent with the default form's `validationErrors` output,
and does not include existing errors of other fields; for full errors read the snapshot's `errors`, and the `validationChanged` published by `validate()` is also a full result.
