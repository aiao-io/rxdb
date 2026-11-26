# EntityFormEvent

```ts
type EntityFormEvent =
  | {
      event: FormFieldChangeEvent;
      type: 'fieldChanged';
    }
  | {
      result: FormValidationResult;
      type: 'validationErrors';
    }
  | {
      data: EntityFormData;
      type: 'reset';
    }
  | {
      data: EntityFormData;
      type: 'submitted';
    }
  | {
      data: EntityFormData;
      type: 'cancelled';
    };
```

Defined in: packages/rxdb-model/dist/entity-form/headless.d.ts:38

Reason for a form state change.

## Remarks

`validationErrors` only describes the parse failures of this `setField` input, consistent with the default form's `validationErrors` output,
and does not include existing errors of other fields; read the snapshot's `errors` for the full errors, and the `validationChanged` published by `validate()` is also the full result.
