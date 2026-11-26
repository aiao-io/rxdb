# WORKING_TREE_CAPABILITY_VERSION

```ts
const WORKING_TREE_CAPABILITY_VERSION: 1 = 1;
```

Defined in: [packages/rxdb-plugin-working-tree/src/plugin.ts:69](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/plugin.ts#L69)

The version number this capability writes into the watermark row

## Remarks

Together with `COMMIT_PROTOCOL_VERSION` / `COMMIT_GRAPH_SCHEMA_VERSION` this is **three different axes** —
do not merge them. The other two describe "how the commit graph's contents are encoded" and are strictly
compared field by field on the capability row by `assertSupportedCommitCapability()`; this one only describes
"which version of this plugin has touched the database", and the core uses it to write the watermark row but
does **not compare it** (see [RxDBSystemContribution.version](../../rxdb/interfaces/RxDBSystemContribution.md#version)).

The cost of merging them into one axis is concrete: every commit graph encoding bump would rename the
watermark row (`__rxdb_capability__:workingTree:N:…`), and a rename means the claim on existing databases
**no longer matches** — the guard would judge a whole batch of plugin-installed databases as unclaimed.
