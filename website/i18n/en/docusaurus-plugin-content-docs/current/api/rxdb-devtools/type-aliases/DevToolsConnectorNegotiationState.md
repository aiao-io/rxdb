# DevToolsConnectorNegotiationState

```ts
type DevToolsConnectorNegotiationState = 'idle' | 'announced' | 'offered' | 'v2';
```

Defined in: [v2/negotiation-connector.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/negotiation-connector.ts#L42)

State of the connector negotiation state machine.

## Remarks

`announced` the eager legacy handshake has been sent; `offered` responded to at least one HELLO, waiting for ACK;
`v2` received an ACK echoing this side's session.
