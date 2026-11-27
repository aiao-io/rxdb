# withTimeWindows()

```ts
function withTimeWindows<T>(source, debounce, audit): Observable<T>;
```

Defined in: [packages/utils/src/async/withTimeWindows.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/async/withTimeWindows.ts#L43)

Attaches debounce / sampling to a stream according to window configuration.

## Type Parameters

| Type Parameter                    | Description             |
| --------------------------------- | ----------------------- |
| <a id="type-parameter-t"></a> `T` | The stream's value type |

## Parameters

| Parameter  | Type                    | Description                                                              |
| ---------- | ----------------------- | ------------------------------------------------------------------------ |
| `source`   | `Observable`&lt;`T`&gt; | Source stream                                                            |
| `debounce` | `number`                | Debounce window in milliseconds; a non-positive finite value disables it |
| `audit`    | `number`                | Sampling window in milliseconds; a non-positive finite value disables it |

## Returns

`Observable`&lt;`T`&gt;

The stream with the operators attached; when both windows are disabled, **returns `source` as-is** (reference-equal)

## Remarks

When both are enabled they take effect **in series**, in the fixed order `debounceTime → auditTime` — not either/or.

RAN-011: previously the two operators were chained unconditionally, so under the default configuration (`0` / `0`) every value still passed through both `debounceTime(0)` and `auditTime(0)` on the `asyncScheduler` — synchronous consumers (Angular OnPush views' `markForCheck`, Vue/React same-tick re-renders) could never receive the value in the current cycle. Disabled windows now stay out of the pipeline entirely, letting the default path degrade to synchronous pass-through.

Pipes segment by segment instead of collecting an operator array and calling `pipe(...operators)`: `pipe` overloads are declared with fixed arity, and spreading an array does not produce a tuple type (TS2556).

This definition is shared by Angular's `RxDBEntityChangeDirective` and Vue/React's `useEntityChange` (RVU-010): each framework copying its own copy would inevitably drift, and what drifts is exactly these one-character-apart decisions above.
