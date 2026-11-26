# SwitchBranchRollbackEvent

Defined in: [packages/rxdb/src/rxdb-events.ts:435](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L435)

Branch switch rollback event

## Extends

- [`SwitchBranchEventBase`](SwitchBranchEventBase.md)

## Constructors

### Constructor

```ts
new SwitchBranchRollbackEvent(branchName): SwitchBranchRollbackEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:418](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L418)

#### Parameters

| Parameter    | Type     | Description |
| ------------ | -------- | ----------- |
| `branchName` | `string` | Branch name |

#### Returns

`SwitchBranchRollbackEvent`

#### Inherited from

[`SwitchBranchEventBase`](SwitchBranchEventBase.md).[`constructor`](SwitchBranchEventBase.md#constructor)

## Properties

### branchName \{#branchname\}

```ts
readonly branchName: string;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:420](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L420)

Branch name

#### Inherited from

[`SwitchBranchEventBase`](SwitchBranchEventBase.md).[`branchName`](SwitchBranchEventBase.md#branchname)

---

### type \{#type\}

```ts
type: 'SWITCH_BRANCH_ROLLBACK' = SWITCH_BRANCH_ROLLBACK;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:436](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L436)
