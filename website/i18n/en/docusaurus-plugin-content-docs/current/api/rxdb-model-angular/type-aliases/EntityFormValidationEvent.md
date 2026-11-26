# EntityFormValidationEvent

```ts
type EntityFormValidationEvent = object;
```

Defined in: packages/rxdb-model/dist/entity-form/headless.d.ts:58

Event fired when validation completes (including when it passes).

## Remarks

After the app language or catalog changes, existing validation errors are rebuilt in the new language and published via this event, with the data and input unchanged.

## Properties

| Property                              | Modifier   | Type                                                            | Defined in                                            |
| ------------------------------------- | ---------- | --------------------------------------------------------------- | ----------------------------------------------------- |
| <a id="property-result"></a> `result` | `readonly` | [`FormValidationResult`](../interfaces/FormValidationResult.md) | packages/rxdb-model/dist/entity-form/headless.d.ts:60 |
| <a id="property-type"></a> `type`     | `readonly` | `"validationChanged"`                                           | packages/rxdb-model/dist/entity-form/headless.d.ts:59 |
