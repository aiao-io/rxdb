# uninstallWorkingTreeCapture()

```ts
function uninstallWorkingTreeCapture(target): void;
```

Defined in: [packages/rxdb/src/capture/capture-interceptor.ts:354](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/capture/capture-interceptor.ts#L354)

Uninstalls the capture mount points, restoring the five write primitives to their state before installation.

## Parameters

| Parameter | Type                                                                                | Description                                                                                            |
| --------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `target`  | [`WorkingTreeCaptureMountTarget`](../type-aliases/WorkingTreeCaptureMountTarget.md) | The adapter instance previously rewritten by [installWorkingTreeCapture](installWorkingTreeCapture.md) |

## Returns

`void`

## Remarks

**What gets restored is the "property descriptors", not a blanket re-installation of bound functions.** On a normal adapter the primitives come from the prototype, so deleting the own property restores them — and what is restored is the `this`-polymorphic version: calls made through the facade inside a transaction still land in that transaction. Reinstalling the `bind(target)` version would weld that polymorphism permanently onto the real adapter: after uninstall, `executor.mergeChanges` would queue up behind a slot it is itself holding. Implementations in class-field form (test stand-ins) already have own properties before installation; in that case the saved descriptors are written back as they were.

**If nothing was installed, do nothing — there is no "primitive fallback" to accept.** The previous paragraph explains that reinstalling bound functions is exactly the thing to avoid, so when the descriptor table has no entry, the only correct action is to leave it alone — the target is already in its pre-installation state. An earlier shape took an extra `raw` parameter and welded the bound function on when the lookup failed, which is doing exactly the opposite on the only path that can trigger it.
