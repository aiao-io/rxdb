# ScopeDisposer

```ts
type ScopeDisposer = () => void | Promise<void>;
```

Defined in: [packages/utils/src/lifecycle/lifecycle-scope.interface.ts:7](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/lifecycle/lifecycle-scope.interface.ts#L7)

A handle that undoes one registration.

May return a `Promise`; [LifecycleScope.dispose](../classes/LifecycleScope.md#dispose) **serially** waits for it to settle before running the next one; repeated calls are no-ops — after the first call the entry has already been removed from the scope's list.

## Returns

`void` \| `Promise`&lt;`void`&gt;
