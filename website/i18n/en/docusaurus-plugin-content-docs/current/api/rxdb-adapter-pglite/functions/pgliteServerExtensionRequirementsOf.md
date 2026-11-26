# pgliteServerExtensionRequirementsOf()

```ts
function pgliteServerExtensionRequirementsOf(entities): PGliteServerExtensionRequirements;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.utils.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.utils.ts#L38)

The PGlite server extensions a set of entities requires the adapter to load (see `pglite-server-extensions.ts`): `btree_gist` is required whenever any entity declares range exclusion (`exclusions`).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entities` | readonly [`EntityType`](../../rxdb/type-aliases/EntityType.md)[] | Entities participating in database creation (`rxdb.config.entities`) |

## Returns

[`PGliteServerExtensionRequirements`](../interfaces/PGliteServerExtensionRequirements.md)

## Remarks

Under browser / Node the adapter loads them automatically based on this. On the desktop (Electron), PGlite is created by the host on the main process; the host uses the same decision to determine whether to install `@electric-sql/pglite/contrib/btree_gist` in `createRuntime`.
