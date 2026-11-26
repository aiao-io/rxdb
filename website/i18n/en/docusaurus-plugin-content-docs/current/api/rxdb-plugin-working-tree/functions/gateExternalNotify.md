# gateExternalNotify()

```ts
function gateExternalNotify<TResult>(request, notify): TResult;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/external-notify-gate.ts:70](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/external-notify-gate.ts#L70)

Judges an external update notification, executing the notification body only when it is allowed through.

## Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-tresult"></a> `TResult` | The return type of the notification body; the gate passes it through as-is without any wrapping |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `request` | [`ExternalNotifyGateRequest`](../interfaces/ExternalNotifyGateRequest.md) | The entity name, target class and capability bit |
| `notify` | () => `TResult` | The **not-yet-invoked** notification body |

## Returns

`TResult`

The return value of `notify()` itself

## Throws

[WorkingTreeWriteRejectedError](../classes/WorkingTreeWriteRejectedError.md) thrown when the target is a versioned business entity and the commit capability is enabled;
  in that case `notify` is never invoked

## Remarks

The judgment is **not re-implemented here**; it asks [classifyWriteEntrance](classifyWriteEntrance.md) directly. The `operation` / `columns` / `untrackedFields` passed in are formal parameters required by the matrix, not criteria: row 11 lands on `reject` unconditionally for versioned targets, so whatever values the three take, the step that looks at them is never reached (see `classifyVersionedTarget`). Approximating here by "which columns changed" would be a second judgment outside the matrix.

**The core does not call this function directly**; it calls the same-named forwarding gate on the capture hook. That layer translates the entity identity into `targetClass` before it lands here. The core side therefore knows no capture semantics at all, and the judgment still has exactly one implementation.

## Example

```ts
// the plugin's capture runtime — classification and capability bits live there
gateExternalNotify<T>(entityName: string, namespace: string | undefined, notify: () => T): T {
  return gateExternalNotify(
    { entityName, targetClass: this.targetClassOf(entityName, namespace), capabilityEnabled: true },
    notify
  );
}
```
