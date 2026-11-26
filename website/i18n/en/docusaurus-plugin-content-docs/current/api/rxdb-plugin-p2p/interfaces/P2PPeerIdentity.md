# P2PPeerIdentity

Defined in: [packages/rxdb-plugin-p2p/src/session/identity.ts:12](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/identity.ts#L12)

The identity of one end of a session: an authenticated principal plus a running instance.

## Properties

### instanceId \{#instanceid\}

```ts
readonly instanceId: string;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/identity.ts:16](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/identity.ts#L16)

Running instance identifier: multiple instances on the same device (tabs, app processes) differ.

---

### principal \{#principal\}

```ts
readonly principal: P2PPrincipal;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/identity.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/identity.ts#L14)

A user and device verified by the auth host.
