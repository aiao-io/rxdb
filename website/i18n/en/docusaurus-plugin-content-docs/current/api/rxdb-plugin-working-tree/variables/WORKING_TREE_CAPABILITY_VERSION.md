# WORKING_TREE_CAPABILITY_VERSION

```ts
const WORKING_TREE_CAPABILITY_VERSION: 1 = 1;
```

Defined in: [packages/rxdb-plugin-working-tree/src/plugin.ts:69](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/plugin.ts#L69)

The version number this capability writes into the watermark row

## Remarks

It is a **different axis** from `COMMIT_PROTOCOL_VERSION` / `COMMIT_GRAPH_SCHEMA_VERSION`; do not merge them.
Those two describe "how the commit graph's content is encoded", and `assertSupportedCommitCapability()` strictly compares them field by field on the capability row;
this one only describes "which version of this plugin has touched this database", the core uses it to write the watermark row and does **not compare it**
(see [RxDBSystemContribution.version](../../rxdb/interfaces/RxDBSystemContribution.md#version)).

The cost of merging into one axis is concrete: bump the commit graph encoding once, and the watermark row name (`__rxdb_capability__:workingTree:N:…`)
changes with it, and renaming means the claim on existing databases **no longer matches** — the guard would judge a batch of databases with the plugin installed as unclaimed.
