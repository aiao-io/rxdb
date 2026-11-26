# useAction()

```ts
function useAction<Options, RT>(promiseFn): ActionResource<Options, RT>;
```

Defined in: [rxdb-react/src/use-action.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/use-action.ts#L58)

Wraps an async function into an action with an in-flight state.

## Type Parameters

| Type Parameter                                | Default type | Description                       |
| --------------------------------------------- | ------------ | --------------------------------- |
| <a id="type-parameter-options"></a> `Options` | `void`       | Input parameter type of `execute` |
| <a id="type-parameter-rt"></a> `RT`           | `unknown`    | Return type of the async function |

## Parameters

| Parameter   | Type                                 | Description                                                                    |
| ----------- | ------------------------------------ | ------------------------------------------------------------------------------ |
| `promiseFn` | (`options`) => `Promise`&lt;`RT`&gt; | The async function that actually runs; a new one may be passed on every render |

## Returns

[`ActionResource`](../interfaces/ActionResource.md)&lt;`Options`, `RT`&gt;

See [ActionResource](../interfaces/ActionResource.md)

## Example

```tsx
const save = useAction((todo: Todo) => repository.save(todo));

return (
  <button disabled={save.isPending} onClick={() => save.execute(todo)}>
    `{save.isPending ? 'Saving…' : 'Save'}`
  </button>
);
```

## Remarks

`isPending` is a **concurrency counter**, not a boolean switch: it stays `true` while N calls are in flight, until the last one settles. The counter is decremented in `finally`, so **failures reset it correctly too**.

Deduplication and cancellation are deliberately **not** implemented: repeated clicks really execute multiple times, and errors are rejected to the caller as-is. If you need debouncing, serialization or cancellation, handle it inside `promiseFn` or at the call site — hiding the policy inside the hook would turn "the button did nothing" into an undebuggable black box.

Equivalent implementations on the other two frameworks: Angular `useAction` (`Signal`), Vue `useAction` (`ComputedRef`), with identical semantics — only `isPending`'s container shape differs.
