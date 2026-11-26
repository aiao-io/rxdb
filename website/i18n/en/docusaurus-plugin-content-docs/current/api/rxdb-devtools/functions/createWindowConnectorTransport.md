# createWindowConnectorTransport()

```ts
function createWindowConnectorTransport(): DevToolsConnectorTransport;
```

Defined in: [connector-transport.ts:72](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-transport.ts#L72)

Browser implementation: window bus + MessageChannel private port.

## Returns

[`DevToolsConnectorTransport`](../interfaces/DevToolsConnectorTransport.md)

The transport layer of the existing connector behavior.
