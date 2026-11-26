# createDevToolsPanelEndpoint()

```ts
function createDevToolsPanelEndpoint(ports): DevToolsPanelEndpoint;
```

Defined in: [v2/panel-endpoint.ts:904](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/panel-endpoint.ts#L904)

Creates the panel-side data plane client.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `ports` | [`DevToolsPanelEndpointPorts`](../interfaces/DevToolsPanelEndpointPorts.md) | The send/receive callbacks and the clock. |

## Returns

[`DevToolsPanelEndpoint`](../interfaces/DevToolsPanelEndpoint.md)

A platform-independent data plane client.

## Remarks

One instance serves exactly one transport connection; a reconnect must create a new one (same rationale as the negotiation machine: the v1 facade is terminal, and the boundary of terminal state is the connection itself).
