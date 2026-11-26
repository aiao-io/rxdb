# RxDBBranchSwitchContext

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:131](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L131)

The context received by [RxDBSystemContribution.prepareBranchSwitch](RxDBSystemContribution.md#preparebranchswitch)

## Properties

### currentBranchId \{#currentbranchid\}

```ts
readonly currentBranchId: string | null;
```

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:142](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L142)

The current branch id; `null` when there is no active branch at all

***

### executor \{#executor\}

```ts
readonly executor: TransactionExecutor;
```

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:139](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L139)

The executor of **the switch transaction itself**

#### Remarks

What is read and written here lives and dies with the switch that follows: throwing rolls back the whole thing, leaving no half-switched working tree behind.
Being able to write does not mean one should — see [RxDBSystemContribution.prepareBranchSwitch](RxDBSystemContribution.md#preparebranchswitch).

***

### preconditions \{#preconditions\}

```ts
readonly preconditions: 
  | RxDBBranchSwitchPreconditions
  | undefined;
```

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:148](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L148)

The preconditions proposed by the caller; `undefined` when none were proposed, which is the same thing as an empty object

***

### targetBranchId \{#targetbranchid\}

```ts
readonly targetBranchId: string;
```

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:145](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L145)

The id of the branch to switch to
