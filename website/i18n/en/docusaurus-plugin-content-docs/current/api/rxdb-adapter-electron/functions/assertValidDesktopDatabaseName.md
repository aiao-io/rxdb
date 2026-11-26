# assertValidDesktopDatabaseName()

```ts
function assertValidDesktopDatabaseName(databaseName): void;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-storage.d.ts:48

Validates the logical database name.

## Parameters

| Parameter      | Type     | Description                  |
| -------------- | -------- | ---------------------------- |
| `databaseName` | `string` | The logical name to validate |

## Returns

`void`

## Remarks

The input comes from the renderer and is **untrusted** even with `contextIsolation`; the host side must validate it again.
The allowed set is a whitelist, not a blacklist: the character set contains no `/`, `\`, or `:`, and does not allow a leading `.`,
so `..`, absolute paths, drive letters, `~` expansion, and URL schemes all fall outside the set —
no need to enumerate attack shapes one by one. WINDOWS\_RESERVED\_DEVICE\_NAME\_PATTERN is the one blacklist that must be added —
those names are legal but do not point at files.

## Throws

throws [RxDBAdapterDesktopError](../classes/RxDBAdapterDesktopError.md) with code `invalid_database_name` when invalid
