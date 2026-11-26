# P2PSessionRole

```ts
type P2PSessionRole = 'initiator' | 'responder';
```

Defined in: [packages/rxdb-plugin-p2p/src/session/session.ts:71](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/session.ts#L71)

The local side's role in the session: the side initiating the connection is `initiator`; used for deduplicating simultaneous dials.
