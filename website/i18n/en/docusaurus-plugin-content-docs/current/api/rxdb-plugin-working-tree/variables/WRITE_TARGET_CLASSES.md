# WRITE_TARGET_CLASSES

```ts
const WRITE_TARGET_CLASSES: readonly ["versioned", "untracked", "system"];
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry-matrix.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry-matrix.ts#L34)

The table categories a write can target

## Remarks

The three classes exhaust the database's tables, and **only `versioned` needs protection**: `untracked`
covers business tables the versioned domain judges as unversioned (QueryCache entities' contents are
rebuildable from the remote; entities with change logging disabled are outside branches and history to begin
with), and `system` is the database's own bookkeeping. The judgment can therefore short-circuit two classes
by target class before even looking at the entrance, and every remaining branch is "who is writing this
versioned business table".
