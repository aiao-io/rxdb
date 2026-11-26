# resolveMiniProgramHost()

```ts
function resolveMiniProgramHost(options): MiniProgramHost;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/host.ts:181](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/host.ts#L181)

Resolves the single host from `{ wechat }` or `{ host }`, and validates the platform id.

Passing both or neither is rejected outright: picking one to use would be hiding a configuration error.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`MiniProgramHostSelection`](../type-aliases/MiniProgramHostSelection.md) |

## Returns

[`MiniProgramHost`](../interfaces/MiniProgramHost.md)
