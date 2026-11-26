# createSystemClock()

```ts
function createSystemClock(): DevToolsClock;
```

Defined in: [v2/clock.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/clock.ts#L61)

A real clock based on the host's `Date.now` / `setTimeout`.

## Returns

[`DevToolsClock`](../interfaces/DevToolsClock.md)

A [DevToolsClock](../interfaces/DevToolsClock.md) that delegates directly to the host timers.

## Remarks

The default for production paths (the `DevToolsConnector` and the panel negotiation side). Tests and the conformance driver should use `createFakeClock()` from `@aiao/rxdb-devtools/testing` instead.
