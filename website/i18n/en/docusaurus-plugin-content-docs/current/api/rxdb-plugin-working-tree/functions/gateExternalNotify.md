# gateExternalNotify()

```ts
function gateExternalNotify<TResult>(request, notify): TResult;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/external-notify-gate.ts:70](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/external-notify-gate.ts#L70)

Judges one external update notification, executing the notification body only when allowed

## Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-tresult"></a> `TResult` | The notification body's return type; the gate passes it through as-is, without any wrapping |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `request` | [`ExternalNotifyGateRequest`](../interfaces/ExternalNotifyGateRequest.md) | Entity name, target class and capability bit |
| `notify` | () => `TResult` | The **not-yet-invoked** notification body |

## Returns

`TResult`

`notify()`'s return value itself

## Throws

[WorkingTreeWriteRejectedError](../classes/WorkingTreeWriteRejectedError.md) thrown when the target is a versioned business entity and the commit capability is enabled;
  in that case `notify` is never invoked

## Remarks

The judgment is **not written a second time here**; it asks [classifyWriteEntrance](classifyWriteEntrance.md) directly. The `operation` / `columns` / `untrackedFields` fed in are formal parameters the matrix requires, not criteria: row 11 lands `reject` unconditionally on versioned targets, and whatever values the three take never reach the step that inspects them (see `classifyVersionedTarget`). Approximating here by "which columns changed" is a second judgment outside the matrix.

**The core does not call this function directly**; it calls the same-named forwarding gate on the capture hook; that layer translates the entity identity into a `targetClass` before landing here. The core side therefore knows no capture semantics at all, while the judgment still exists in exactly one place.

## Example

```ts
// The plugin's capture runtime — it owns the classification and the capability bit
gateExternalNotify<T>(entityName: string, namespace: string | undefined, notify: () => T): T {
  return gateExternalNotify(
    { entityName, targetClass: this.targetClassOf(entityName, namespace), capabilityEnabled: true },
    notify
  );
}
```
