# forkPointOf()

```ts
function forkPointOf(branch): number;
```

Defined in: [packages/rxdb-plugin-history/src/find-switch-branch-step.ts:69](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/find-switch-branch-step.ts#L69)

**`Internal`**

Reads a branch's fork point change id.

`fromChangeId === null` means **forked at the root** (this branch did not grow out of some change).
Change ids increase from 1, so using 0 to mean "the root" neither collides with any real change nor prevents it
from participating in the range arithmetic that follows.

Extracted into a named function so this convention exists in exactly one place: it previously appeared as `branch.fromChangeId ?? 0`
more than ten times in this file, and readers could not tell which occurrence meant "the root" and which was just a fallback.
The merge preview's common-ancestor search (`branch-compare.ts`) also uses it, hence the export.

## Parameters

| Parameter | Type                                             | Description    |
| --------- | ------------------------------------------------ | -------------- |
| `branch`  | [`RxDBBranch`](../../rxdb/classes/RxDBBranch.md) | The branch row |

## Returns

`number`

The fork point change id; 0 when forked at the root
