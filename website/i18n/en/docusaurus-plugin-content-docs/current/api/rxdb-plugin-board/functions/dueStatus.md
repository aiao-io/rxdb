# dueStatus()

```ts
function dueStatus(dueDate, today): DueStatus | null;
```

Defined in: [packages/rxdb-plugin-board/src/due-status.ts:12](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/due-status.ts#L12)

Due date status relative to local today; returns `null` when there is no due date.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `dueDate` | `string` \| `null` |
| `today` | `string` |

## Returns

[`DueStatus`](../type-aliases/DueStatus.md) \| `null`
