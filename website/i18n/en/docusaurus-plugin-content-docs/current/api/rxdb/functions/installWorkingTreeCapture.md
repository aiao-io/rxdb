# installWorkingTreeCapture()

```ts
function installWorkingTreeCapture(target, hook): RawWritePrimitives;
```

Defined in: [packages/rxdb/src/capture/capture-interceptor.ts:251](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/capture/capture-interceptor.ts#L251)

Installs the four capture mount points on a local adapter instance.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `target` | [`WorkingTreeCaptureMountTarget`](../type-aliases/WorkingTreeCaptureMountTarget.md) | The adapter instance |
| `hook` | [`WorkingTreeCaptureHook`](../interfaces/WorkingTreeCaptureHook.md) | The capture runtime that takes over the four mount points |

## Returns

[`RawWritePrimitives`](../interfaces/RawWritePrimitives.md)

The five unintercepted write primitives; handed to the capture runtime's [WorkingTreeCaptureHook.bindMountTarget](../interfaces/WorkingTreeCaptureHook.md#bindmounttarget)

## Remarks

**The install moment is "when the hook is installed", not the constructor.** Installing in the constructor gets overwritten by subclass class fields —
class field assignments run after `super()`, so a `transaction = vi.fn()` style line would wipe out the wrapper that was just installed,
and at that moment `this.transaction` itself is still `undefined`, so the primitive cannot even be bound. Installed when the hook is in place, the object
is already fully constructed, and both problems disappear together.

**All five wrappers are `function`s, not arrow functions.** Calls inside a transaction reach the same instance through the executor facade
(`adapter.mergeChanges.call(facade, …)`), and `this` is the entire information of "which transaction this write should land in".
An arrow function drops it, so a merge inside the transaction is queued as if it were outside the transaction — while the queue's only slot is occupied
by this very transaction, manifesting as a permanent hang rather than an error.

The wrappers for `upsertMany` / `deleteByIds` forward **synchronously**, with no `async` in between: wrapping them in async would turn a synchronous
throw into a rejected promise, while adapter-contract.md §1.1 requires exactly "the caller holds no Observable to subscribe to".

## Example

```ts
setWorkingTreeCaptureHook(hook: WorkingTreeCaptureHook): void {
  hook.bindMountTarget(this, installWorkingTreeCapture(this, hook));
}
```
