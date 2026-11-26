# DevToolsConnectorNegotiationMessage

```ts
type DevToolsConnectorNegotiationMessage = 
  | DevToolsV2Message
  | AnyDevToolsMessage;
```

Defined in: [v2/negotiation-connector.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/negotiation-connector.ts#L45)

Messages the connector negotiation state machine may emit: an eager legacy handshake, or v2 frames.
