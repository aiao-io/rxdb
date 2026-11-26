# assertSupportedRxDBSystemVersions()

```ts
function assertSupportedRxDBSystemVersions(state): void;
```

Defined in: [packages/rxdb/src/system/migration.ts:311](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/migration.ts#L311)

Asserts that the library's version is not higher than what this process supports; otherwise refuses to open.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `state` | [`RxDBSystemVersionState`](../interfaces/RxDBSystemVersionState.md) | The result of [getRxDBSystemVersionState](getRxDBSystemVersionState.md) |

## Returns

`void`

## Throws

[UnsupportedRxDBSystemVersionError](../classes/UnsupportedRxDBSystemVersionError.md) when any number is higher than this process's constant

## Remarks

Only blocks "the library is newer than the client". Outdated ones (including `0` for a brand-new library) always pass here — that is the normal path
handled by [isCurrentRxDBSystemVersion](isCurrentRxDBSystemVersion.md), where the adapter runs the catch-up migration;
blocking it here would make every library that needs an upgrade fail to open.
