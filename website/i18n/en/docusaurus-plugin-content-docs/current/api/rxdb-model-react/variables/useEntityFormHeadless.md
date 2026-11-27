# useEntityFormHeadless

```ts
const useEntityFormHeadless: (options) => UseEntityFormResult = useEntityForm;
```

Defined in: [packages/rxdb-model-react/src/entity-form/headless.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-form/headless.ts#L60)

Named alias for convenience with composition-style APIs.

Binds the shared form state to the React lifecycle.

## Parameters

| Parameter | Type                                                                          |
| --------- | ----------------------------------------------------------------------------- |
| `options` | [`EntityFormControllerOptions`](../interfaces/EntityFormControllerOptions.md) |

## Returns

[`UseEntityFormResult`](../interfaces/UseEntityFormResult.md)

## Remarks

Field and mode changes preserve the draft; only a semantic change of the host data resets it. The controller is kept in component state,
and StrictMode replay and re-display after `<Activity>` hiding reuse the same instance.
