# toPGliteEngineInfo()

```ts
function toPGliteEngineInfo(version): PGliteEngineInfo;
```

Defined in: [packages/rxdb-adapter-pglite/src/backup/pglite-backup-compat.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/backup/pglite-backup-compat.ts#L59)

Computes engine information from the raw text of `SHOW server_version`.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `version` | `string` | Raw text of `SHOW server_version`, e.g. `17.5` |

## Returns

[`PGliteEngineInfo`](../interfaces/PGliteEngineInfo.md)

Engine information

## Remarks

The desktop host must answer the engine version even when the target database does not exist yet, and what it has is the version text rather than a queryable runtime, so the compatibility-key algorithm is exported separately and shared by both ends.
