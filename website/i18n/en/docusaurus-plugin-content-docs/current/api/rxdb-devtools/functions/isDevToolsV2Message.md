# isDevToolsV2Message()

```ts
function isDevToolsV2Message(value): value is DevToolsV2Message;
```

Defined in: [v2/wire.ts:395](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L395)

A strict inner guard: checks whether a value is a fully valid v2 message.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `unknown` | The value to check. |

## Returns

`value is DevToolsV2Message`

`true` when the shell, session consistency and payload all pass.
