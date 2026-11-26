# MergeBranchEventBase

Defined in: [packages/rxdb/src/rxdb-events.ts:446](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L446)

Common payload of the three branch merge events

## Remarks

Like [SwitchBranchEventBase](SwitchBranchEventBase.md), carries no `type`, pinned by the subclasses.
Both branch names are **names** rather than ids, used directly for user-facing messages.

## Extended by

- [`MergeBranchBeginEvent`](MergeBranchBeginEvent.md)
- [`MergeBranchCommitEvent`](MergeBranchCommitEvent.md)
- [`MergeBranchFailedEvent`](MergeBranchFailedEvent.md)

## Constructors

### Constructor

```ts
new MergeBranchEventBase(sourceBranch, targetBranch): MergeBranchEventBase;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:447](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L447)

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `sourceBranch` | `string` | Source branch name |
| `targetBranch` | `string` | Target branch name |

#### Returns

`MergeBranchEventBase`

## Properties

### sourceBranch \{#sourcebranch\}

```ts
readonly sourceBranch: string;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:449](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L449)

Source branch name

***

### targetBranch \{#targetbranch\}

```ts
readonly targetBranch: string;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:451](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L451)

Target branch name
