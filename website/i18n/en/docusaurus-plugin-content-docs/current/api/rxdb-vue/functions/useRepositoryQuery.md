# useRepositoryQuery()

```ts
function useRepositoryQuery<T, TOptions, RT>(
   EntityType, 
   method, 
   defaultValue, 
   options
): RxDBResource<RT>;
```

Defined in: [rxdb-vue/src/hooks.ts:124](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/hooks.ts#L124)

The core hook implementation for RxDB repository queries, managing reactive subscriptions and state updates.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityType`](../../rxdb/type-aliases/EntityType.md) |
| <a id="type-parameter-toptions"></a> `TOptions` |
| <a id="type-parameter-rt"></a> `RT` |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `EntityType` | `T` | Entity class. |
| `method` | `string` | The query method name on the repository. |
| `defaultValue` | `RT` | Placeholder value before the first value arrives from the subscription. |
| `options` | [`UseOptions`](../type-aliases/UseOptions.md)&lt;`TOptions`&gt; | Query options; may be a constant, a getter, a `Ref` or a `ComputedRef`. |

## Returns

[`RxDBResource`](../interfaces/RxDBResource.md)&lt;`RT`&gt;

Reactive resource; for the state combination and lifecycle contract see [RxDBResource](../interfaces/RxDBResource.md).

## Throws

Thrown while computing the content key when options contain non-serializable values (thrown synchronously during setup; see [createQueryOptionsKey](../../utils/functions/createQueryOptionsKey.md)).

## Remarks

RVU-002: options trigger re-queries by **content**, not by reference — mutating fields of a `reactive` object in place re-queries, while a structurally equivalent new reference does not re-subscribe. `EntityType` and `method` are inputs captured during setup and never change within one setup, so they are not watch sources.

RVU-003: a new query round resets `isLoading/error/hasValue/isEmpty` synchronously at entry, while `value` keeps the old value. This is the same contract as the Angular effect's entry and React's render-time reset.

Under SSR there is no `window`, so the subscription is skipped; client hydration is a brand-new setup, which starts querying normally. The subscription is unsubscribed automatically when the effect scope is destroyed, and late emissions are dropped via requestId.
