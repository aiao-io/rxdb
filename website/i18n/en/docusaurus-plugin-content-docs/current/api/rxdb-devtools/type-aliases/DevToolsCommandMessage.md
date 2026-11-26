# DevToolsCommandMessage

```ts
type DevToolsCommandMessage =
  | HandshakeAckMessage
  | DevToolsDisconnectMessage
  | DisconnectRxdbMessage
  | ClearMessage
  | PingMessage
  | InspectDbMessage
  | QueryEntityMessage
  | GetBranchesMessage
  | SwitchBranchMessage
  | CreateBranchMessage
  | DeleteBranchMessage;
```

Defined in: [types.ts:425](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L425)

All messages allowed to enter the page command handler.
