# DevToolsClock

Defined in: [v2/clock.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/clock.ts#L33)

Protocol clock port.

## Remarks

Exposes only two things: reading the current time and registering one-shot delayed callbacks.
**Deliberately no `setInterval`** — the protocol has no periodic behavior, and offering one
more primitive would only invite implementations to write polling loops that are hard to
advance on downstream drivers.

## Methods

### now() \{#now\}

```ts
now(): number;
```

Defined in: [v2/clock.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/clock.ts#L40)

The current time, in milliseconds.

#### Returns

`number`

#### Remarks

Only for computing how much time has passed; it must not be used as an identity source other
than the `timestamp` on the wire.

---

### setTimeout() \{#settimeout\}

```ts
setTimeout(handler, delayMs): DevToolsCancelTimer;
```

Defined in: [v2/clock.ts:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/clock.ts#L49)

Registers a one-shot delayed callback.

#### Parameters

| Parameter | Type         | Description                                                                           |
| --------- | ------------ | ------------------------------------------------------------------------------------- |
| `handler` | () => `void` | Callback invoked on expiry; the implementation must not swallow exceptions it throws. |
| `delayMs` | `number`     | Delay in milliseconds; must be a non-negative safe integer.                           |

#### Returns

[`DevToolsCancelTimer`](../type-aliases/DevToolsCancelTimer.md)

Cancellation handle.
