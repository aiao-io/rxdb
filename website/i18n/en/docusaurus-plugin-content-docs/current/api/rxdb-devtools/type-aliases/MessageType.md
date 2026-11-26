# MessageType

```ts
type MessageType = 
  | "HANDSHAKE"
  | "HANDSHAKE_ACK"
  | "EVENT"
  | "DISCONNECT"
  | "DISCONNECT_RXDB"
  | "DISCONNECT_RXDB_RESULT"
  | "CLEAR"
  | "PING"
  | "INSPECT_DB"
  | "DB_INFO"
  | "DB_MODEL_INFO"
  | "QUERY_ENTITY"
  | "ENTITY_DATA"
  | "GET_BRANCHES"
  | "BRANCHES"
  | "SWITCH_BRANCH"
  | "CREATE_BRANCH"
  | "DELETE_BRANCH";
```

Defined in: [types.ts:16](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L16)

RxDB DevTools message types.
