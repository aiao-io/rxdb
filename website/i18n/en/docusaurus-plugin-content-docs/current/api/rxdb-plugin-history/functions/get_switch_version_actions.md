# get_switch_version_actions()

```ts
function get_switch_version_actions(
   changes, 
   isPatch, 
   actions?
): SwitchVersionActions;
```

Defined in: [packages/rxdb-plugin-history/src/switch-branch-actions.ts:254](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/switch-branch-actions.ts#L254)

**`Internal`**

Folds a sequence of changes into the writes for switching versions.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `changes` | [`RxDBChange`](../../rxdb/classes/RxDBChange.md)[] | The changes to compute; sorted by `id`, ascending for forward application and descending for reverse |
| `isPatch` | `boolean` | `true` applies `patch` forward, `false` applies `inversePatch` in reverse |
| `actions?` | [`SwitchVersionActions`](../../rxdb/interfaces/SwitchVersionActions.md) | The existing result to fold into; defaults to a new one |

## Returns

[`SwitchVersionActions`](../../rxdb/interfaces/SwitchVersionActions.md)

The folded writes

## Remarks

Exported for `@aiao/rxdb-plugin-working-tree`'s read-only checkouts: the commit view numbers the change units in a commit and hands them here for reverse folding,
sharing the same rules as branch switching and comparison.
