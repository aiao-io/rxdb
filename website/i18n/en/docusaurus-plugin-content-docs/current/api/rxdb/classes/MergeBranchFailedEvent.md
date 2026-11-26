# MergeBranchFailedEvent

Defined in: [packages/rxdb/src/rxdb-events.ts:471](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L471)

Branch merge failed event

## Remarks

See [MERGE\_BRANCH\_FAILED](../variables/MERGE_BRANCH_FAILED.md) for the semantics: the merge did not finish, but the part already applied will **not** be rolled back.

## Extends

- [`MergeBranchEventBase`](MergeBranchEventBase.md)

## Constructors

### Constructor

```ts
new MergeBranchFailedEvent(sourceBranch, targetBranch): MergeBranchFailedEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:447](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L447)

#### Parameters

| Parameter      | Type     | Description        |
| -------------- | -------- | ------------------ |
| `sourceBranch` | `string` | Source branch name |
| `targetBranch` | `string` | Target branch name |

#### Returns

`MergeBranchFailedEvent`

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

---

### targetBranch \{#targetbranch\}

```ts
readonly targetBranch: string;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:451](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L451)

Target branch name

#### Inherited from

[`MergeBranchEventBase`](MergeBranchEventBase.md).[`targetBranch`](MergeBranchEventBase.md#targetbranch)

---

### type \{#type\}

```ts
readonly type: "MERGE_BRANCH_FAILED" = MERGE_BRANCH_FAILED;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:472](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L472)
