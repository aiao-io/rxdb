# isActiveTimeWindow()

```ts
function isActiveTimeWindow(duration): boolean;
```

Defined in: [packages/utils/src/async/withTimeWindows.ts:16](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/async/withTimeWindows.ts#L16)

Whether the time window actually needs to be wired into the pipeline.

## Parameters

| Parameter  | Type     | Description                         |
| ---------- | -------- | ----------------------------------- |
| `duration` | `number` | The window duration in milliseconds |

## Returns

`boolean`

`true` only when `duration` is a **positive finite value**

## Remarks

RAN-011: only a positive finite value represents a real time window. `0` (the default at every call site) means "disabled"; negative values and `NaN` are meaningless inputs; `Infinity` would make `debounceTime` never emit — all three cases must keep the operator out of the pipeline entirely, rather than "attaching a 0 ms window".
