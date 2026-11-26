# useAction()

```ts
function useAction<Options, RT>(promiseFn): ActionResource<Options, RT>;
```

Defined in: [rxdb-angular/src/use-action.ts:63](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/use-action.ts#L63)

Wraps an async function into a callable action with a loading state.

## Type Parameters

| Type Parameter                                | Default type | Description                                           |
| --------------------------------------------- | ------------ | ----------------------------------------------------- |
| <a id="type-parameter-options"></a> `Options` | `void`       | Call argument type; default `void` means no arguments |
| <a id="type-parameter-rt"></a> `RT`           | `unknown`    | Return type of the async function                     |

## Parameters

| Parameter   | Type                                 | Description                |
| ----------- | ------------------------------------ | -------------------------- |
| `promiseFn` | (`options`) => `Promise`&lt;`RT`&gt; | The wrapped async function |

## Returns

[`ActionResource`](../interfaces/ActionResource.md)&lt;`Options`, `RT`&gt;

See [ActionResource](../interfaces/ActionResource.md)

## Remarks

**Concurrency semantics**: internally it counts unfinished calls (rather than a boolean flag), so under multiple concurrent calls `isPending` stays true until the **last** one completes. The action itself neither deduplicates nor cancels in-flight calls — for "only one at a time", the caller should guard itself while `isPending` is true.

Errors thrown by the wrapped function bubble up as-is, and `isPending` is restored in `finally` (RAN-015).

Equivalent implementations across all three frameworks: Vue `useAction` (`ComputedRef`), React `useAction` (render snapshot); the semantics are identical, only the container shape of `isPending` differs.
