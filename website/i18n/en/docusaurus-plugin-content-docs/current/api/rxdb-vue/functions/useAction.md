# useAction()

```ts
function useAction<Options, RT>(promiseFn): ActionResource<Options, RT>;
```

Defined in: [rxdb-vue/src/use-action.ts:54](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/use-action.ts#L54)

Wraps an async function into a callable action with a loading state.

## Type Parameters

| Type Parameter                                | Default type | Description                                             |
| --------------------------------------------- | ------------ | ------------------------------------------------------- |
| <a id="type-parameter-options"></a> `Options` | `void`       | Call parameter type; default `void` means no parameters |
| <a id="type-parameter-rt"></a> `RT`           | `unknown`    | Return type of the async function                       |

## Parameters

| Parameter   | Type                                 | Description                                                                         |
| ----------- | ------------------------------------ | ----------------------------------------------------------------------------------- |
| `promiseFn` | (`options`) => `Promise`&lt;`RT`&gt; | The wrapped async function; captured once during setup and never re-read afterwards |

## Returns

[`ActionResource`](../interfaces/ActionResource.md)&lt;`Options`, `RT`&gt;

See [ActionResource](../interfaces/ActionResource.md)

## Example

```ts
const save = useAction(async (todo: Todo) => repository.save(todo));

// In templates use save.isPending to disable the button and save.execute(todo) to trigger it
```

## Remarks

**Concurrency semantics**: internally it counts outstanding calls (rather than a boolean flag), so with multiple concurrent calls `isPending` stays true until the **last** one completes — an earlier completion does not set it to false prematurely. The action itself does not deduplicate or cancel in-flight calls; if you need "only one running at a time", intercept on the caller side while `isPending` is true.

Errors thrown by the wrapped function bubble up as-is, and the count is restored in `finally`.

It does not depend on a component instance and can be called outside setup; the returned `isPending` is a plain `computed`, its lifecycle follows the scope that holds it, and there are no subscriptions to clean up.

Equivalent implementations on the other two frameworks: Angular `useAction` (`Signal<boolean>`), React `useAction` (snapshot `boolean`).
