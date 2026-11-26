# createConnectorProviders()

```ts
function createConnectorProviders(ports?): ConnectorProviderRegistry;
```

Defined in: [connector-providers.ts:173](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-providers.ts#L173)

Assembles the provider seams according to what this page actually supports.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `ports?` | [`ConnectorProviderPorts`](../interfaces/ConnectorProviderPorts.md) | The host entry points available on this page. |

## Returns

[`ConnectorProviderRegistry`](../interfaces/ConnectorProviderRegistry.md)

A registry that can be handed directly to the v2 endpoint, plus a subscription reclaim entry point.

## Remarks

`provider()` and `createChunkSink()` **throw** for unassembled domains instead of returning a "supports nothing" stand-in: a stand-in would turn a wiring mistake into a normal-looking protocol response, while this needs it to blow up immediately. Unassembled domains are already rejected at the authorization layer by the descriptor set, so the throw is structurally unreachable.
