# MergeBranchBeginEvent

Defined in: [packages/rxdb/src/rxdb-events.ts:456](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L456)

Branch merge begin event

## Extends

- [`MergeBranchEventBase`](MergeBranchEventBase.md)

## Constructors

### Constructor

```ts
new MergeBranchBeginEvent(sourceBranch, targetBranch): MergeBranchBeginEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:447](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L447)

#### Parameters

| Parameter      | Type     | Description        |
| -------------- | -------- | ------------------ |
| `sourceBranch` | `string` | Source branch name |
| `targetBranch` | `string` | Target branch name |

#### Returns

`MergeBranchBeginEvent`

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
readonly type: "MERGE_BRANCH_BEGIN" = MERGE_BRANCH_BEGIN;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:457](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L457)
