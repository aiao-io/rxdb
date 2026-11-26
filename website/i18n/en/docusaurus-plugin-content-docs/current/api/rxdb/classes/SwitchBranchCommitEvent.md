# SwitchBranchCommitEvent

Defined in: [packages/rxdb/src/rxdb-events.ts:430](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L430)

Branch switch commit event

## Extends

- [`SwitchBranchEventBase`](SwitchBranchEventBase.md)

## Constructors

### Constructor

```ts
new SwitchBranchCommitEvent(branchName): SwitchBranchCommitEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:418](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L418)

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `branchName` | `string` | Branch name |

#### Returns

`SwitchBranchCommitEvent`

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

***

### type \{#type\}

```ts
type: "SWITCH_BRANCH_COMMIT" = SWITCH_BRANCH_COMMIT;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:431](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L431)
