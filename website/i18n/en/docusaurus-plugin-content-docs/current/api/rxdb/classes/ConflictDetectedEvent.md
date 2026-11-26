# ConflictDetectedEvent

Defined in: [packages/rxdb/src/rxdb-events.ts:531](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L531)

Conflict detected event

Fired when a conflict between local unsynced changes and remote changes is detected during pull

## Constructors

### Constructor

```ts
new ConflictDetectedEvent(
   conflicts,
   resolved,
   deferred
): ConflictDetectedEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:534](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L534)

#### Parameters

| Parameter   | Type                                      | Description                       |
| ----------- | ----------------------------------------- | --------------------------------- |
| `conflicts` | [`Conflict`](../interfaces/Conflict.md)[] | The discovered conflict list      |
| `resolved`  | `number`                                  | The number automatically resolved |
| `deferred`  | `number`                                  | The number deferred               |

#### Returns

`ConflictDetectedEvent`

## Properties

### conflicts \{#conflicts\}

```ts
readonly conflicts: Conflict[];
```

Defined in: [packages/rxdb/src/rxdb-events.ts:536](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L536)

The discovered conflict list

---

### deferred \{#deferred\}

```ts
readonly deferred: number;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:540](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L540)

The number deferred

---

### resolved \{#resolved\}

```ts
readonly resolved: number;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:538](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L538)

The number automatically resolved

---

### type \{#type\}

```ts
readonly type: "CONFLICT_DETECTED" = CONFLICT_DETECTED_EVENT;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:532](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L532)
