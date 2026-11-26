# DevToolsPanelNegotiationMessage

```ts
type DevToolsPanelNegotiationMessage = DevToolsV2Message | HandshakeAckMessage;
```

Defined in: [v2/negotiation-panel.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/negotiation-panel.ts#L43)

Messages the panel negotiation state machine may emit: v2 frames, or the legacy ACK inside the v1 facade.
