# HistoryItem

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:272](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L272)

History record item
Represents an undoable/redoable unit of operations

## Properties

### changeId \{#changeid\}

```ts
changeId: number;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:273](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L273)

***

### changes \{#changes\}

```ts
changes: RxDBChange[];
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:312](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L312)

All changes contained in this history item

***

### count \{#count\}

```ts
count: number;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:317](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L317)

Number of changes

***

### createdAt \{#createdat\}

```ts
createdAt: Date;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:322](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L322)

Timestamp of the latest change

***

### description \{#description\}

```ts
description: string;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:302](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L302)

Description (for UI display)

#### Example

```ts
- Single change: "Create User" "Update Todo" "Delete Post"
- Multiple changes: "Transaction: 2 created, 3 updated"
```

***

### entity \{#entity\}

```ts
entity: string;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:288](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L288)

Entity name

***

### fingerprint \{#fingerprint\}

```ts
fingerprint: string;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:278](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L278)

Unique fingerprint identifying this history item

***

### namespace \{#namespace\}

```ts
namespace: string;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:283](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L283)

Namespace

***

### redoInvalidated \{#redoinvalidated\}

```ts
redoInvalidated: boolean;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:334](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L334)

Whether redo is invalidated
true means this history item's redo operation has been discarded (true when any one change is discarded)

***

### reverted \{#reverted\}

```ts
reverted: boolean;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:328](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L328)

Whether it has been undone
true means this history item has been undone (true when any one change is undone)

***

### transactionId \{#transactionid\}

```ts
transactionId: `${string}-${string}-${string}-${string}-${string}` | null;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:307](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L307)

Transaction ID

***

### type \{#type\}

```ts
type: "INSERT" | "UPDATE" | "DELETE" | "TRANSACTION";
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:293](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L293)

Operation type
