# buildOfflineWriteRepositoryRules()

```ts
function buildOfflineWriteRepositoryRules(
  entities,
  syncConfig,
  repoSyncs
): (
  | Rule<RxDBChange, StringKey<RxDBChange>, RuleValueDefault>
  | RuleGroupBase<RxDBChange, StringKey<RxDBChange>, Rule<RxDBChange, StringKey<RxDBChange>, RuleValueDefault>>
)[];
```

Defined in: [packages/rxdb/src/sync-contract/pushable-repository-rules.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/pushable-repository-rules.ts#L45)

Builds the OR group for "repositories that are writable offline but have no changelog endpoint"; the shape is identical to [buildPushableRepositoryRules](buildPushableRepositoryRules.md).

## Parameters

| Parameter    | Type                                                                                                              | Description                                                                                                                                                         |
| ------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entities`   | readonly [`EntityType`](../type-aliases/EntityType.md)[]                                                          | `config.entities`, the source of truth for the repository set                                                                                                       |
| `syncConfig` | \| [`SyncOptions`](../type-aliases/SyncOptions.md) \| [`EntitySyncResolver`](../interfaces/EntitySyncResolver.md) | The instance resolver `rxdb.entitySync` (including instance overrides); when `config.sync` is passed, resolution follows entity declaration \> global fallback only |
| `repoSyncs`  | [`RxDBSync`](../classes/RxDBSync.md)[]                                                                            | Sync records already existing on the current branch                                                                                                                 |

## Returns

(
\| [`Rule`](../type-aliases/Rule.md)&lt;[`RxDBChange`](../classes/RxDBChange.md), `StringKey`&lt;[`RxDBChange`](../classes/RxDBChange.md)&gt;, `RuleValueDefault`&gt;
\| [`RuleGroupBase`](../interfaces/RuleGroupBase.md)&lt;[`RxDBChange`](../classes/RxDBChange.md), `StringKey`&lt;[`RxDBChange`](../classes/RxDBChange.md)&gt;, [`Rule`](../type-aliases/Rule.md)&lt;[`RxDBChange`](../classes/RxDBChange.md), `StringKey`&lt;[`RxDBChange`](../classes/RxDBChange.md)&gt;, `RuleValueDefault`&gt;&gt;)[]

One AND rule per repository awaiting replay; an empty array when there are no such repositories.

## Remarks

The criterion is `offlineWrite && !push` (at this stage only `querycache`), which is exactly complementary to `push` in [buildPushableRepositoryRules](buildPushableRepositoryRules.md): the two rule sets never overlap, so adding the counts from both sides never double-counts the same row.
