# useEntityForm()

```ts
function useEntityForm(options): UseEntityFormResult;
```

Defined in: [packages/rxdb-model-react/src/entity-form/headless.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-form/headless.ts#L24)

Binds the shared form state to the React lifecycle.

## Parameters

| Parameter | Type                                                                          |
| --------- | ----------------------------------------------------------------------------- |
| `options` | [`EntityFormControllerOptions`](../interfaces/EntityFormControllerOptions.md) |

## Returns

[`UseEntityFormResult`](../interfaces/UseEntityFormResult.md)

## Remarks

Field and mode changes keep the draft; it resets only when the host data semantically changes. The controller is kept in component state,
so StrictMode replays and re-showing after `<Activity>` hides reuse the same instance.
