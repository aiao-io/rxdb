# defaultPrintErr()

```ts
function defaultPrintErr(msg): void;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts#L45)

Default `printErr` implementation: filters out known noise, then forwards to `console.error`.

## Parameters

| Parameter | Type     |
| --------- | -------- |
| `msg`     | `string` |

## Returns

`void`
