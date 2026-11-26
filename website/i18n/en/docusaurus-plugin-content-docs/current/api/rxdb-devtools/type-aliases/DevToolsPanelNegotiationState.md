# DevToolsPanelNegotiationState

```ts
type DevToolsPanelNegotiationState = "idle" | "awaiting" | "v2" | "v1-facade";
```

Defined in: [v2/negotiation-panel.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/negotiation-panel.ts#L40)

State of the panel negotiation state machine.

## Remarks

`idle` initialized but no handshake evidence yet; `awaiting` a legacy handshake staged, window timer running;
`v2` session established; `v1-facade` is terminal, renegotiation happens only on transport reconnect.
