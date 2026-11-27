# SwitchBranchEventBase

Defined in: [packages/rxdb/src/rxdb-events.ts:417](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L417)

Common payload of the three branch switch events

## Remarks

Carries no `type`, so it is not itself a dispatchable event — `type` is pinned by each of the three subclasses,
and the keys of [RxDBEventMap](../interfaces/RxDBEventMap.md) rely on that literal type.

## Extended by

- [`SwitchBranchBeginEvent`](SwitchBranchBeginEvent.md)
- [`SwitchBranchCommitEvent`](SwitchBranchCommitEvent.md)
- [`SwitchBranchRollbackEvent`](SwitchBranchRollbackEvent.md)

## Constructors

### Constructor

```ts
new SwitchBranchEventBase(branchName): SwitchBranchEventBase;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:418](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L418)

#### Parameters

| Parameter    | Type     | Description |
| ------------ | -------- | ----------- |
| `branchName` | `string` | Branch name |

#### Returns

`SwitchBranchEventBase`

## Properties

### branchName \{#branchname\}

```ts
readonly branchName: string;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:420](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L420)

Branch name
