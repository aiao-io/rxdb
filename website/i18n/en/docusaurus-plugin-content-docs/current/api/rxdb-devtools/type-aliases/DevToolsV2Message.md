# DevToolsV2Message

```ts
type DevToolsV2Message = { [TType in DevToolsV2MessageType]: DevToolsV2Envelope<TType> }[DevToolsV2MessageType];
```

Defined in: [v2/wire.ts:209](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L209)

Discriminated union of all v2 messages.
