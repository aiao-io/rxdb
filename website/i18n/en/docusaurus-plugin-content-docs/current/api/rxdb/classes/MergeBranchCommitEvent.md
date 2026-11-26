# MergeBranchCommitEvent

Defined in: [packages/rxdb/src/rxdb-events.ts:461](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L461)

Branch merge commit event

## Extends

- [`MergeBranchEventBase`](MergeBranchEventBase.md)

## Constructors

### Constructor

```ts
new MergeBranchCommitEvent(sourceBranch, targetBranch): MergeBranchCommitEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:447](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L447)

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `sourceBranch` | `string` | Source branch name |
| `targetBranch` | `string` | Target branch name |

#### Returns

`MergeBranchCommitEvent`

#### Inherited from

[`MergeBranchEventBase`](MergeBranchEventBase.md).[`constructor`](MergeBranchEventBase.md#constructor)

## Properties

### sourceBranch \{#sourcebranch\}

```ts
readonly sourceBranch: string;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:449](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L449)

Source branch name

#### Inherited from

[`MergeBranchEventBase`](MergeBranchEventBase.md).[`sourceBranch`](MergeBranchEventBase.md#sourcebranch)

***

### targetBranch \{#targetbranch\}

```ts
readonly targetBranch: string;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:451](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L451)

Target branch name

#### Inherited from

[`MergeBranchEventBase`](MergeBranchEventBase.md).[`targetBranch`](MergeBranchEventBase.md#targetbranch)

***

### type \{#type\}

```ts
readonly type: "MERGE_BRANCH_COMMIT" = MERGE_BRANCH_COMMIT;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:462](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L462)
