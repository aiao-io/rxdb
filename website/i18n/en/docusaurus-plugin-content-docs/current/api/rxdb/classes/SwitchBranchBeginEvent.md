# SwitchBranchBeginEvent

Defined in: [packages/rxdb/src/rxdb-events.ts:425](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L425)

Branch switch begin event

## Extends

- [`SwitchBranchEventBase`](SwitchBranchEventBase.md)

## Constructors

### Constructor

```ts
new SwitchBranchBeginEvent(branchName): SwitchBranchBeginEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:418](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L418)

#### Parameters

| Parameter    | Type     | Description |
| ------------ | -------- | ----------- |
| `branchName` | `string` | Branch name |

#### Returns

`SwitchBranchBeginEvent`

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
type: 'SWITCH_BRANCH_BEGIN' = SWITCH_BRANCH_BEGIN;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:426](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L426)
