# P2PHandlerResult

Defined in: [packages/rxdb-plugin-p2p/src/session/session.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/session.ts#L37)

The return value of a protocol handler; the default result is `null` with an empty payload.

## Properties

### payload? \{#payload\}

```ts
readonly payload?: Uint8Array<ArrayBufferLike>;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/session.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/session.ts#L41)

Binary payload; replies with payloads are queued as bulk frames and yield to control frames.

---

### result? \{#result\}

```ts
readonly result?: P2PJsonValue;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/session.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/session.ts#L39)

JSON result.
