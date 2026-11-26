# DEVTOOLS_TRANSFER_IDLE_TIMEOUT_MS

```ts
const DEVTOOLS_TRANSFER_IDLE_TIMEOUT_MS: 15000;
```

Defined in: [v2/constants.ts:69](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/constants.ts#L69)

Idle time limit of a transfer, in milliseconds.

## Remarks

Only refreshed by START / CHUNK / COMPLETE frames that **pass the guard**. Letting rejected frames refresh the timer would let an
attacker keep a transfer alive indefinitely with illegal frames, so the rejection decision must come before the refresh.
