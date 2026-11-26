# buildVersionedDomain()

```ts
function buildVersionedDomain(entities): VersionedDomain;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts:426](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts#L426)

Computes the versioned domain from entity registrations

## Parameters

| Parameter  | Type                                                                                   | Description                                       |
| ---------- | -------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `entities` | readonly [`VersionedDomainEntityInput`](../interfaces/VersionedDomainEntityInput.md)[] | All registered entities; **will not be modified** |

## Returns

[`VersionedDomain`](../interfaces/VersionedDomain.md)

A domain view that is independent of input order and reproducibly constructs item-by-item equal results

## Throws

RxDBError when a registration cannot report any physical table name

## Remarks

A pure function: constructed twice from the same input, the two lists are item-by-item equal, and neither the
passed array nor the objects inside it are mutated — downstream judgment receives a **view** of the domain,
and the domain itself does not change after construction.

Table names are normalized to lowercase here, so "normalization" happens in only two places on the whole
chain: domain construction (on registrations) and raw judgment (on statements). Leaving normalization to the
six adapters individually means a single loose implementation anywhere punches a hole in the whole line.

Each tracked table's addressable names are reported by the **adapter** (see
[VersionedDomainEntityInput.physicalTableNames](../interfaces/VersionedDomainEntityInput.md#physicaltablenames)),
usually two: the logical name and the SQLite family's physical name. The domain does not guess, and neither
does the judgment — the judgment side has no namespace to compare against and can only guess by prefix;
guessing wide hits FTS shadow tables by mistake, guessing narrow is that hole; and a guess on the domain side
is a second set of rules that would not error when the original changes, only start computing wrong.

When a registration cannot report any name, it **throws**, see normalizePhysicalTableNames.

Registrations are indexed by **identity** (`namespace:entityName`), with a second bare-name index for call
sites that only have an entity name (the contract at the `RxDBAdapter.upsertMany()` layer has no namespace).
On a bare-name collision no entry is picked as the representative — any pick would have to rely on
registration order, which is the written order of `config.entities`, and changing one unrelated line would
change the answer. Collisions are left to the judgment side, which explicitly treats them as "counts only
when all agree".

## Example

```ts
const domain = buildVersionedDomain([
  {
    entityName: 'Post',
    namespace: 'public',
    physicalTableNames: ['post', 'public$post'],
    syncType: SyncType.Full,
    derivedIndexColumns: ['title_norm']
  },
  {
    entityName: 'ProductCache',
    namespace: 'public',
    physicalTableNames: ['productcache'],
    syncType: SyncType.QueryCache
  },
  {
    entityName: 'FileMeta',
    namespace: 'storage',
    physicalTableNames: ['file_meta'],
    syncType: SyncType.None,
    log: false
  }
]);

domain.classifyEntity('Post'); // 'tracked'
domain.classifyEntity('ProductCache'); // 'untracked'
domain.classifyEntity('FileMeta'); // 'untracked' — change logging is off
domain.classifyEntity('Post', 'shop'); // 'tracked' — no such registration, falls back to the default
domain.hasEntity('Post', 'shop'); // false — this is where it differs from the line above
domain.isUntrackedField('Post', 'title_norm'); // true — a registered derived column
domain.isUntrackedField('Comment', 'title_norm'); // false — another table's same-named column is not exempt along with it
```
