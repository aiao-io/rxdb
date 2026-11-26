# useRepositoryQuery()

```ts
function useRepositoryQuery<T, TOptions, TResult>(
   EntityType, 
   method, 
   defaultValue, 
   options
): RxDBResource<TResult>;
```

Defined in: [rxdb-react/src/hooks.ts:71](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/hooks.ts#L71)

Wires an Observable query of an entity static repository into the React render lifecycle.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityType`](../../rxdb/type-aliases/EntityType.md) |
| <a id="type-parameter-toptions"></a> `TOptions` |
| <a id="type-parameter-tresult"></a> `TResult` |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `EntityType` | `T` | Entity type; its static side must provide the repository query named by `method`. |
| `method` | `string` | Name of the static repository query method. |
| `defaultValue` | `TResult` | Placeholder value used before the first subscription and when the entity type changes. |
| `options` | [`UseOptions`](../type-aliases/UseOptions.md)&lt;`TOptions`&gt; | Query options constant or an idempotent factory. |

## Returns

[`RxDBResource`](../interfaces/RxDBResource.md)&lt;`TResult`&gt;

Resource snapshot of the query for the current render; see [RxDBResource](../interfaces/RxDBResource.md) for the state combinations.

## Throws

Synchronously when the options are not serializable, or when the factory returns a different structure within the same render.

## Remarks

Options derive the query identity from their content; structurally equal new objects do not trigger a re-subscription. Valid entity cursors are projected by their ordering fields, other class instances are rejected. When the identity changes, the resource metadata is synchronously reset first, and the old request is invalidated in a layout effect, so the old Observable cannot pollute the new query before passive cleanup.

A missing query method, a synchronous throw, or an Observable error are all written to `resource.error`; they never propagate from the effect up the call stack. Unsubscribes and rejects late callbacks on component unmount or query identity change. SSR does not run effects, so the resource keeps its initial state; option resolution still happens during the server render, and invalid options throw synchronously as usual.
