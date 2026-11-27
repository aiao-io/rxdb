# EntityFormValidationEvent

```ts
type EntityFormValidationEvent = object;
```

Defined in: [packages/rxdb-model/src/entity-form/headless.ts:74](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/headless.ts#L74)

Event for validation completion (including a passed validation).

## Remarks

After the application language or catalog changes, existing validation errors are rebuilt in the new language and published with this event; data and input stay unchanged.

## Properties

| Property                              | Modifier   | Type                                                            | Defined in                                                                                                                                                                              |
| ------------------------------------- | ---------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <a id="property-result"></a> `result` | `readonly` | [`FormValidationResult`](../interfaces/FormValidationResult.md) | [packages/rxdb-model/src/entity-form/headless.ts:74](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/headless.ts#L74) |
| <a id="property-type"></a> `type`     | `readonly` | `"validationChanged"`                                           | [packages/rxdb-model/src/entity-form/headless.ts:74](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-form/headless.ts#L74) |
