# gateBulkWrite()

```ts
function gateBulkWrite<TResult>(request, run): TResult;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/bulk-write-gate.ts:110](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/bulk-write-gate.ts#L110)

Judges one bulk write, invoking the write primitive factory only when allowed

## Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-tresult"></a> `TResult` | The write primitive's return type; the gate passes it through as-is, without any wrapping |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `request` | [`BulkWriteGateRequest`](../interfaces/BulkWriteGateRequest.md) | Entity name, method, target class and capability bit |
| `run` | () => `TResult` | The **not-yet-invoked** write primitive factory |

## Returns

`TResult`

`run()`'s return value itself (the same instance)

## Throws

[WorkingTreeWriteRejectedError](../classes/WorkingTreeWriteRejectedError.md) thrown **synchronously** when the target is a versioned business entity table and the commit capability is enabled;
  in that case `run` is never invoked

## Remarks

The return type is deliberately bare `TResult` rather than `Observable<TResult>`: the gate **doesn't know** the return is an Observable, so it cannot `pipe`, `defer` or casually subscribe to it at the type level. Existing QueryCache callers did not sign up for this feature, and those operations would genuinely change their subscription semantics — cold becomes hot, subscribing twice writes once, unsubscribing no longer cancels the write. FR-046's zero behavior difference holds for them as well.

The judgment itself is **not written a second time here**; it asks [classifyWriteEntrance](classifyWriteEntrance.md) directly. Hand-writing an approximation like "bulk writes only block update" is where the first divergence would appear.

## Example

```ts
upsertMany(entityName: string, rows: readonly Row[]): Observable<void> {
  return gateBulkWrite(
    { entityName, operation: 'upsert_many', targetClass: this.classOf(entityName), capabilityEnabled: this.enabled },
    () => this.#upsertMany(entityName, rows)
  );
}
```
