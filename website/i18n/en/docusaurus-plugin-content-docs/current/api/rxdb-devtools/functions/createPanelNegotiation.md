# createPanelNegotiation()

```ts
function createPanelNegotiation(ports): DevToolsPanelNegotiation;
```

Defined in: [v2/negotiation-panel.ts:281](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/negotiation-panel.ts#L281)

Creates the panel-side negotiation machine.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `ports` | [`DevToolsPanelNegotiationPorts`](../interfaces/DevToolsPanelNegotiationPorts.md) | The send/receive callbacks and the clock. |

## Returns

[`DevToolsPanelNegotiation`](../interfaces/DevToolsPanelNegotiation.md)

A platform-independent negotiation machine.

## Remarks

One instance serves exactly one transport connection. A reconnect must create a new one — reusing it would let the v1 facade's terminal state leak across connections, and the boundary of "terminal state" is exactly the reconnect.

## Throws

TypeError when `supportedVersions` is not a valid version table.
