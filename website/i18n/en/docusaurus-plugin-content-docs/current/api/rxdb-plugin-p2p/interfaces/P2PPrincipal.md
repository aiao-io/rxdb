# P2PPrincipal

Defined in: [packages/rxdb-plugin-p2p/src/session/identity.ts:4](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/identity.ts#L4)

A user and device verified by the auth host.

## Properties

### deviceId \{#deviceid\}

```ts
readonly deviceId: string;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/identity.ts:8](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/identity.ts#L8)

The device identifier the auth host registered for this user; different devices of the same user hold and revoke independently.

***

### principal \{#principal\}

```ts
readonly principal: string;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/identity.ts:6](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/identity.ts#L6)

The authenticated principal (user) identifier.
