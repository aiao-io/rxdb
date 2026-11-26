# isDevToolsV2Envelope()

```ts
function isDevToolsV2Envelope(value): value is DevToolsV2EnvelopeShape;
```

Defined in: [v2/wire.ts:379](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/wire.ts#L379)

A wide outer guard: checks whether a value is the shell of a v2 message, and **does not validate the payload**.

## Parameters

| Parameter | Type      | Description                                                  |
| --------- | --------- | ------------------------------------------------------------ |
| `value`   | `unknown` | The value to check, usually from `postMessage` / Port / IPC. |

## Returns

`value is DevToolsV2EnvelopeShape`

`true` when the shell is valid.
