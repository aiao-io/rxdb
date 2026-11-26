# isNetworkError()

```ts
function isNetworkError(error): boolean;
```

Defined in: [packages/rxdb/src/repository/network-error.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/network-error.ts#L85)

Determines whether an error is a network failure (cannot reach the remote), rather than a business result returned by the remote.

## Parameters

| Parameter | Type      | Description      |
| --------- | --------- | ---------------- |
| `error`   | `unknown` | Any caught value |

## Returns

`boolean`

`true` only when the error can be positively identified as a network failure

## Remarks

**The default direction is "not a network error"**: unrecognized errors always return `false` and are rethrown unchanged by the caller. The reverse would be more dangerous — 401s, unique-key conflicts and field validation failures treated as offline would hand the caller a stale cache instead of the reason for failure, deferring the problem to some unknown later time.

Criteria, in priority order:

1. [NetworkOfflineError](../classes/NetworkOfflineError.md) — already classified
2. A numeric `status` → **not** a network error. Receiving an HTTP status code proves the connection works; 502 / 503 are also answers given by the remote, not a severed cable
3. Node errno (NETWORK\_ERRNO)
4. `DOMException.name` (NETWORK\_ERROR\_NAMES)
5. The `TypeError` messages specific to `fetch()` failures

## Example

```typescript
try {
  await remote.fetchMetadata('Todo', where);
} catch (error) {
  if (!isNetworkError(error)) throw error; // rethrow business errors unchanged
  return readLocalCache();
}
```
