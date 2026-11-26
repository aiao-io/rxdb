# isRepositorySyncEnabled()

```ts
function isRepositorySyncEnabled(repoSync?): boolean;
```

Defined in: [packages/rxdb/src/sync-contract/sync-type-utils.ts:234](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/sync-type-utils.ts#L234)

Judges whether a repository's sync switch is in the enabled state.

## Parameters

| Parameter   | Type                                                                      | Description                                                                                           |
| ----------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `repoSync?` | [`RepositorySyncSwitch`](../interfaces/RepositorySyncSwitch.md) \| `null` | The repository's sync record on the current branch; pass `undefined` / `null` when no record is found |

## Returns

`boolean`

Whether it is enabled.

## Remarks

**A missing record counts as enabled**: `RxDBSync` is created lazily (written only on the first sync, and the write is `enabled = true`); treating "no record" as disabled would make any repository's first sync block itself.

## Example

```ts
isRepositorySyncEnabled(undefined); // true —— has never synced
isRepositorySyncEnabled({ enabled: false }); // false
```
