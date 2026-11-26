# createConnectorNegotiation()

```ts
function createConnectorNegotiation(ports): DevToolsConnectorNegotiation;
```

Defined in: [v2/negotiation-connector.ts:254](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/negotiation-connector.ts#L254)

Creates the connector-side negotiation state machine.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `ports` | [`DevToolsConnectorNegotiationPorts`](../interfaces/DevToolsConnectorNegotiationPorts.md) | Send/receive callbacks, the clock, local trusted configuration, and the eager legacy handshake. |

## Returns

[`DevToolsConnectorNegotiation`](../interfaces/DevToolsConnectorNegotiation.md)

A platform-independent negotiation state machine.

## Remarks

One instance serves exactly one transport connection: the session identity is minted with the instance, and reconnecting requires creating a new one.

## Throws

TypeError when `supportedVersions` is not a legal version list.
