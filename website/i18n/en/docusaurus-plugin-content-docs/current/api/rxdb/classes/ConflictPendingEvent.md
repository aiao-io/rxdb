# ConflictPendingEvent

Defined in: [packages/rxdb/src/rxdb-events.ts:549](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L549)

Conflict pending event

Fired when a conflict resolution result is DEFER

## Constructors

### Constructor

```ts
new ConflictPendingEvent(conflicts): ConflictPendingEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:552](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L552)

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `conflicts` | [`Conflict`](../interfaces/Conflict.md)[] | The pending conflict list |

#### Returns

`ConflictPendingEvent`

## Properties

### conflicts \{#conflicts\}

```ts
readonly conflicts: Conflict[];
```

Defined in: [packages/rxdb/src/rxdb-events.ts:554](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L554)

The pending conflict list

***

### type \{#type\}

```ts
readonly type: "CONFLICT_PENDING" = CONFLICT_PENDING_EVENT;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:550](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L550)
