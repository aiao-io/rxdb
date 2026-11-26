# buildPushableRepositoryRules()

```ts
function buildPushableRepositoryRules(
   entities, 
   syncConfig, 
   repoSyncs
): (
  | Rule<RxDBChange, StringKey<RxDBChange>, RuleValueDefault>
  | RuleGroupBase<RxDBChange, StringKey<RxDBChange>, Rule<RxDBChange, StringKey<RxDBChange>, RuleValueDefault>>)[];
```

Defined in: [packages/rxdb/src/sync-contract/pushable-repository-rules.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/pushable-repository-rules.ts#L23)

Builds an OR group from "the repositories that are push-eligible under the current configuration"; sync records only provide the watermark.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entities` | readonly [`EntityType`](../type-aliases/EntityType.md)[] | `config.entities`, the single source of truth for the repository set |
| `syncConfig` | \| [`SyncOptions`](../type-aliases/SyncOptions.md) \| [`EntitySyncResolver`](../interfaces/EntitySyncResolver.md) | The instance resolver `rxdb.entitySync` (including instance overrides); when `config.sync` is passed, resolution goes by entity declaration \> global fallback only |
| `repoSyncs` | [`RxDBSync`](../classes/RxDBSync.md)[] | The sync records that already exist on the current branch |

## Returns

(
  \| [`Rule`](../type-aliases/Rule.md)&lt;[`RxDBChange`](../classes/RxDBChange.md), `StringKey`&lt;[`RxDBChange`](../classes/RxDBChange.md)&gt;, `RuleValueDefault`&gt;
  \| [`RuleGroupBase`](../interfaces/RuleGroupBase.md)&lt;[`RxDBChange`](../classes/RxDBChange.md), `StringKey`&lt;[`RxDBChange`](../classes/RxDBChange.md)&gt;, [`Rule`](../type-aliases/Rule.md)&lt;[`RxDBChange`](../classes/RxDBChange.md), `StringKey`&lt;[`RxDBChange`](../classes/RxDBChange.md)&gt;, `RuleValueDefault`&gt;&gt;)[]

One AND rule per pushable repository; an empty array when no repository can push

## Remarks

The single source of truth for the repository set is `config.entities × syncType` (definition per [getSyncCapability](getSyncCapability.md)),
not "repositories that already have an RxDBSync record". Records only answer where the watermark is and whether the switch is off.
`enabled = false` vetoes. No record ⇒ that repository has never pushed ⇒ no upper bound is set.
