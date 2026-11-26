# createDevToolsConnectorEndpoint()

```ts
function createDevToolsConnectorEndpoint(ports): DevToolsConnectorEndpoint;
```

Defined in: [v2/endpoint.ts:840](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/endpoint.ts#L840)

Creates the connector-side v2 endpoint.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `ports` | [`DevToolsConnectorEndpointPorts`](../interfaces/DevToolsConnectorEndpointPorts.md) | Send/receive, the clock, the local authorization configuration and the provider seams. |

## Returns

[`DevToolsConnectorEndpoint`](../interfaces/DevToolsConnectorEndpoint.md)

A [DevToolsConnectorEndpoint](../interfaces/DevToolsConnectorEndpoint.md).
