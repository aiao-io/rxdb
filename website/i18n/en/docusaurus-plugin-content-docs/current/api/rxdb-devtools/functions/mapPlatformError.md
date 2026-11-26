# mapPlatformError()

```ts
function mapPlatformError(origin, error): DevToolsErrorPayload;
```

Defined in: [v2/error-mapping.ts:159](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/error-mapping.ts#L159)

Maps a platform exception to a provider error payload.

## Parameters

| Parameter | Type                                                            | Description                                              |
| --------- | --------------------------------------------------------------- | -------------------------------------------------------- |
| `origin`  | [`DevToolsErrorOrigin`](../type-aliases/DevToolsErrorOrigin.md) | The platform the caller is on; no sniffing is performed. |
| `error`   | `unknown`                                                       | An arbitrary value thrown or returned by the platform.   |

## Returns

[`DevToolsErrorPayload`](../interfaces/DevToolsErrorPayload.md)

One of the codes in the exhaustive union, plus the retryability determined by [DEVTOOLS\_PROVIDER\_ERROR\_RETRYABLE](../variables/DEVTOOLS_PROVIDER_ERROR_RETRYABLE.md).

## Remarks

The result **does not include** `message`; the platform's message, stack and original error code never leave the boundary.
