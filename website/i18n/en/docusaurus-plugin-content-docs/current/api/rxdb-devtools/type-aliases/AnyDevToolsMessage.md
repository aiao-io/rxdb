# AnyDevToolsMessage

```ts
type AnyDevToolsMessage = 
  | HandshakeMessage
  | HandshakeAckMessage
  | EventMessage
  | DisconnectMessage
  | DisconnectRxdbMessage
  | DisconnectRxdbResultMessage
  | ClearMessage
  | PingMessage
  | InspectDbMessage
  | DbInfoMessage
  | DbModelInfoMessage
  | QueryEntityMessage
  | EntityDataMessage
  | GetBranchesMessage
  | BranchesMessage
  | SwitchBranchMessage
  | CreateBranchMessage
  | DeleteBranchMessage;
```

Defined in: [types.ts:404](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L404)

All legal RxDB DevTools messages.
