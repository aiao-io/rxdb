# createDevToolsError()

```ts
function createDevToolsError(code, options?): DevToolsErrorPayload;
```

Defined in: [v2/errors.ts:146](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/errors.ts#L146)

Creates an outgoing error envelope.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `code` | [`DevToolsErrorCode`](../type-aliases/DevToolsErrorCode.md) | A code from the exhaustive union. |
| `options?` | [`DevToolsErrorOptions`](../interfaces/DevToolsErrorOptions.md) | Optional `retryable` and redacted message. |

## Returns

[`DevToolsErrorPayload`](../interfaces/DevToolsErrorPayload.md)

A [DevToolsErrorPayload](../interfaces/DevToolsErrorPayload.md) in frozen shape.

## Throws

TypeError when the message fails redaction validation — better to crash the implementation during development than to send a path out.
