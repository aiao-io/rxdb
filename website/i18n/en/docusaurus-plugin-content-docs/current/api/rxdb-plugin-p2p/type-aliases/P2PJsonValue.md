# P2PJsonValue

```ts
type P2PJsonValue = 
  | null
  | boolean
  | number
  | string
  | readonly P2PJsonValue[]
  | P2PJsonObject;
```

Defined in: [packages/rxdb-plugin-p2p/src/session/frame.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/session/frame.ts#L24)

A JSON value that frame metadata can carry.
