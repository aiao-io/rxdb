# ReplayRecordingDbFactory

```ts
type ReplayRecordingDbFactory = (entities) => 
  | RxDB
  | Promise<RxDB>;
```

Defined in: [packages/rxdb-plugin-replay/src/options.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/options.ts#L29)

Recording database factory: receives this plugin's entity list and returns a **separate** `RxDB` (not the recorded application database).

## Parameters

| Parameter | Type |
| ------ | ------ |
| `entities` | readonly [`EntityType`](../../rxdb/type-aliases/EntityType.md)[] |

## Returns

  \| [`RxDB`](../../rxdb/classes/RxDB.md)
  \| `Promise`&lt;[`RxDB`](../../rxdb/classes/RxDB.md)&gt;

## Remarks

Called only once per connection epoch, the first time storage is needed. If the returned database has not been `init()`ed yet, the plugin calls `init()` on its behalf, then `connect()`.
