# UpdateClassification

Defined in: [packages/rxdb/src/query/merge-update.utils.ts:191](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/query/merge-update.utils.ts#L191)

Update classification result

## Properties

### matchBeforeIds \{#matchbeforeids\}

```ts
matchBeforeIds: Set<RxDBEntityId>;
```

Defined in: [packages/rxdb/src/query/merge-update.utils.ts:197](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/query/merge-update.utils.ts#L197)

Entity IDs that matched the criteria before the update

***

### matchNowIds \{#matchnowids\}

```ts
matchNowIds: Set<RxDBEntityId>;
```

Defined in: [packages/rxdb/src/query/merge-update.utils.ts:195](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/query/merge-update.utils.ts#L195)

Entity IDs that match the criteria now

***

### newlyMatchedIds \{#newlymatchedids\}

```ts
newlyMatchedIds: Set<RxDBEntityId>;
```

Defined in: [packages/rxdb/src/query/merge-update.utils.ts:199](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/query/merge-update.utils.ts#L199)

Entities that changed from "not matching" to "matching"

***

### newlyUnmatchedIds \{#newlyunmatchedids\}

```ts
newlyUnmatchedIds: Set<RxDBEntityId>;
```

Defined in: [packages/rxdb/src/query/merge-update.utils.ts:201](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/query/merge-update.utils.ts#L201)

Entities that changed from "matching" to "not matching"

***

### stillMatchedIds \{#stillmatchedids\}

```ts
stillMatchedIds: Set<RxDBEntityId>;
```

Defined in: [packages/rxdb/src/query/merge-update.utils.ts:203](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/query/merge-update.utils.ts#L203)

Entities that matched both before and after the update

***

### updatedIds \{#updatedids\}

```ts
updatedIds: Set<RxDBEntityId>;
```

Defined in: [packages/rxdb/src/query/merge-update.utils.ts:193](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/query/merge-update.utils.ts#L193)

Set of updated entity IDs
