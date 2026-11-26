# EntityFormSubmitResult

```ts
type EntityFormSubmitResult = 
  | {
  changes: Record<string, unknown>;
  data: EntityFormData;
  valid: true;
}
  | {
  result: FormValidationResult;
  valid: false;
};
```

Defined in: packages/rxdb-model/dist/entity-form/headless.d.ts:63

Form submission result.
