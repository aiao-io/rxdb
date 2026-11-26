# EventOrigin

```ts
type EventOrigin = "cross-tab";
```

Defined in: [packages/rxdb/src/rxdb-events.ts:190](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L190)

Event origin marker
- `undefined` or absent: an original event produced locally in the current tab
- `'cross-tab'`: an event received from another tab via BroadcastChannel
