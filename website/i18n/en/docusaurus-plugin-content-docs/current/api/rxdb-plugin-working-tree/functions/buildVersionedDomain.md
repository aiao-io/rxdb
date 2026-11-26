# buildVersionedDomain()

```ts
function buildVersionedDomain(entities): VersionedDomain;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts:426](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts#L426)

Computes the versioned domain from the entity registrations

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entities` | readonly [`VersionedDomainEntityInput`](../interfaces/VersionedDomainEntityInput.md)[] | All registered entities; **will not be modified** |

## Returns

[`VersionedDomain`](../interfaces/VersionedDomain.md)

A domain view that is independent of input order and repeatably constructible with item-by-item equal results

## Throws

RxDBError when some registration cannot report any physical table name

## Remarks

A pure function: built twice from the same input, the two lists are item-by-item equal, and neither the passed array nor the objects inside are modified —
downstream judgments receive a **view** of the domain, and the domain itself does not change after construction.

Table names are uniformly normalized to lowercase here, so "normalization" happens in exactly two places on the whole chain: domain construction (on registrations)
and raw judgment (on statements). Handing normalization to the six adapters separately would mean the whole line of defense has a hole the moment one of them writes it loose.

The addressable names of each tracked table are reported by the **adapter** (see [VersionedDomainEntityInput.physicalTableNames](../interfaces/VersionedDomainEntityInput.md#physicaltablenames)),
usually two: the logical name and the SQLite-family physical name. The domain does not guess, and the judgment does not either — the judgment side has no namespace to compare against,
so it can only guess by prefix; guessing wide misfires on FTS shadow tables, guessing narrow is that hole; and a guess on the domain side would be a second set of rules,
which silently starts computing wrong when the original changes, with no error.

**Throws** when a registration cannot report any name, see normalizePhysicalTableNames.

Registrations are indexed by **identity** (`namespace:entityName`), with a separate bare-name index for call sites that only have the entity name
(the contract at the `RxDBAdapter.upsertMany()` layer has no namespace). On a bare-name collision, no entry is picked as the representative —
picking any would have to rely on registration order, which is the write order of `config.entities`, so changing one unrelated line would change the answer.
Collisions are handled explicitly on the judgment side as "only unanimous counts".

## Example

```ts
const domain = buildVersionedDomain([
  { entityName: 'Post', namespace: 'public', physicalTableNames: ['post', 'public$post'],
    syncType: SyncType.Full, derivedIndexColumns: ['title_norm'] },
  { entityName: 'ProductCache', namespace: 'public', physicalTableNames: ['productcache'],
    syncType: SyncType.QueryCache },
  { entityName: 'FileMeta', namespace: 'storage', physicalTableNames: ['file_meta'],
    syncType: SyncType.None, log: false }
]);

domain.classifyEntity('Post');                     // 'tracked'
domain.classifyEntity('ProductCache');             // 'untracked'
domain.classifyEntity('FileMeta');                 // 'untracked' —— change logging disabled
domain.classifyEntity('Post', 'shop');             // 'tracked' —— no such registration, by the defaults
domain.hasEntity('Post', 'shop');                  // false —— this is the difference from the line above
domain.isUntrackedField('Post', 'title_norm');     // true —— a registered derived column
domain.isUntrackedField('Comment', 'title_norm');  // false —— a same-name column on another table does not get exempted along
```
