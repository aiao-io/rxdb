# DEVTOOLS_TRANSFER_TOTAL_TIMEOUT_MS

```ts
const DEVTOOLS_TRANSFER_TOTAL_TIMEOUT_MS: 600000;
```

Defined in: [v2/constants.ts:78](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/constants.ts#L78)

Total duration cap of a transfer, in milliseconds; starts when START passes the guard.

## Remarks

10 minutes under the 1 GiB cap is equivalent to requiring a minimum throughput of roughly 1.7 MiB/s, and local IPC / Port easily exceeds that.
The 15-second end-to-end time limit does not apply to streaming transfers — that value would inevitably false-kill at the 1 GiB cap.
