# DevToolsCancelTimer

```ts
type DevToolsCancelTimer = () => void;
```

Defined in: [v2/clock.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/clock.ts#L24)

Cancels a registered timer task.

## Returns

`void`

## Remarks

Must be idempotent: calling it repeatedly, or after the callback has already fired, must neither throw nor produce side effects.
The protocol is full of "cancel first, then enter a terminal state" patterns, and idempotence is the precondition of those paths.
