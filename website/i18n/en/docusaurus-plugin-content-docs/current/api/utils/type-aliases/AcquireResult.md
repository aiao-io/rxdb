# AcquireResult

```ts
type AcquireResult = ScopeDisposer | undefined;
```

Defined in: [packages/utils/src/lifecycle/lifecycle-scope.interface.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/lifecycle/lifecycle-scope.interface.ts#L27)

The **setup return value** of [LifecycleScope.acquire](../classes/LifecycleScope.md#acquire): hand over the disposal function, or return `undefined` to mean this side effect needs no release.

## Remarks

The Result in the name refers to "the result of running setup", **not** "the result of the `acquire()` call" — `acquire()` returns the [ScopeDisposer](ScopeDisposer.md) itself. The only purpose of this publicly exported type is to let callers annotate the return type of their setup functions.

The union has **no** `Promise<…>`: that way "resource acquisition across an `await`" is rejected at compile time instead of silently leaking at runtime.

## Example

```ts
const setup = (): AcquireResult => {
  const timer = setInterval(tick, 1000);
  return () => clearInterval(timer);
};
```
