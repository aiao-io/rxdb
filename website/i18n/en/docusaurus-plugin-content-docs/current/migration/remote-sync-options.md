# `RemoteSyncOptions` removal

The `RemoteSyncOptions` type exported by `@aiao/rxdb` 0.0.25 was deleted. **This is a breaking change**, but only at the type level: code that directly does `import type { RemoteSyncOptions }` fails at compile time.

In 0.0.25 **no API accepted this type** — it was an orphaned configuration draft whose two fields had no runtime effect. Deleting the references therefore changes no behavior.

## Where the two fields went

| 0.0.25 field       | Now                                                                                                                                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `conflictResolver` | Whole-database `pull()` takes the new `PullOptions.conflictResolver`; per-repository `pullRepository()` still takes the existing `PullRepositoryOptions.conflictResolver`; with neither passed, LWW is used |
| `autoSync`         | Deleted with no replacement — the 0.0.25 runtime never read it                                                                                                                                              |

## Migration

```diff
-import type { RemoteSyncOptions } from '@aiao/rxdb';
-
-const options: RemoteSyncOptions = { autoSync: false, conflictResolver: myResolver };
+import type { PullOptions } from '@aiao/rxdb';
+
+const options: PullOptions = { conflictResolver: myResolver };

-await rxdb.versionManager.pull();
+await rxdb.syncManager.pull(options);
```

`PullOptions` is still exported from `@aiao/rxdb`; the push/pull methods themselves moved from `rxdb.versionManager` (now provided by `@aiao/rxdb-plugin-history`) to the `rxdb.syncManager` mounted by `@aiao/rxdb-plugin-sync`; installation and registration are in [History and sync package split](./history-sync-plugins.md).

The batch path (`pull()`) and the per-repository path (`pullRepository()`) both pass through the same resolver and produce the same result for the same conflict. The only resolution results the runtime can apply automatically are `KEEP_LOCAL` and `KEEP_REMOTE`.

## See also

- [History and sync package split](./history-sync-plugins.md): the full `versionManager` → `syncManager` mapping
- [Versioning and API stability](../versioning.md): the breaking-change process
