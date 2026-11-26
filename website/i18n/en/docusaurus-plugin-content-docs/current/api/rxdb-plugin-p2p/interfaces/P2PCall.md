# P2PCall

Defined in: [packages/rxdb-plugin-p2p/src/session/session.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/session.ts#L19)

The call content of a request.

## Properties

### method \{#method\}

```ts
readonly method: string;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/session.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/session.ts#L21)

The method name within the protocol.

---

### params? \{#params\}

```ts
readonly params?: P2PJsonValue;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/session.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/session.ts#L23)

JSON parameters, defaulting to `null`.

---

### payload? \{#payload\}

```ts
readonly payload?: Uint8Array<ArrayBufferLike>;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/session.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/session.ts#L25)

Binary payload, defaulting to empty.
