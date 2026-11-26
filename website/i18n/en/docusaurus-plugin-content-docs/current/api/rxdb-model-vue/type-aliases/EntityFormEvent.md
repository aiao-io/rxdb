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

Reasons for form state changes.

## Remarks

`validationErrors` describes only this `setField` input's parse failure, consistent with the default form's `validationErrors` output,
and excludes pre-existing errors of other fields; read the snapshot `errors` for the full errors, and the `validationChanged` published by `validate()` is also a full result.
