# useEntityChange()

```ts
function useEntityChange<T>(entity, options?): EntityChangeResource<T>;
```

Defined in: [rxdb-react/src/use-entity-change.ts:102](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/use-entity-change.ts#L102)

Bridges an entity's patch stream into React rendering so in-place mutations reflect in the view in real time.

## Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` *extends* `unknown` | Entity instance type |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entity` | `T` \| `undefined` | The entity instance to observe; no subscription is created while it is `undefined` |
| `options?` | [`EntityChangeOptions`](../interfaces/EntityChangeOptions.md) | See [EntityChangeOptions](../interfaces/EntityChangeOptions.md) |

## Returns

[`EntityChangeResource`](../interfaces/EntityChangeResource.md)&lt;`T`&gt;

See [EntityChangeResource](../interfaces/EntityChangeResource.md)

## Throws

RxDBError thrown by `getEntityStatus` when the input is not a mounted RxDB entity instance

## Example

```tsx
// Re-renders only after input has been quiet for 200ms
const live = useEntityChange(todo, { debounceTime: 200 });

return <div>{live.value?.title}</div>;
```

## Remarks

Entities are in-place mutable class instances, so React cannot see their field changes. Use this hook to wire `patches$` into the render dependencies when an entity being edited needs live previews in multiple places.

`patches$` carries `shareReplay(1)`: if the entity already had patches before subscription, one replay is received **immediately**, so `revision` may become `1` right after mount.

The subscription is cleaned up automatically on component unmount; when the entity or the time window changes, the old subscription is unsubscribed before a new one is built. `revision` **keeps incrementing** across entity switches (consistent with the Vue side); only `error` is reset.

Equivalent implementations across all three frameworks: Angular's `RxDBEntityChangeDirective` (uses `markForCheck` for OnPush views), Vue's `useEntityChange` (`shallowRef` + `triggerRef`). Time window decisions share `@aiao/utils` `withTimeWindows`; the semantics are identical across all three frameworks.
