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

Defined in: [packages/rxdb-model/src/entity-form/headless.ts:77](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/headless.ts#L77)

Form submission result.
