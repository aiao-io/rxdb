# EntityLocalCreatedEvent

Defined in: [packages/rxdb/src/rxdb-events.ts:336](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L336)

Local entity created event

Fired when an entity is successfully persisted to the database.

## Constructors

### Constructor

```ts
new EntityLocalCreatedEvent(entities): EntityLocalCreatedEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:338](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L338)

#### Parameters

| Parameter  | Type                                                                                                                                         |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `entities` | [`RxDBEntityLocalCreatedEventData`](../interfaces/RxDBEntityLocalCreatedEventData.md)&lt;[`EntityType`](../type-aliases/EntityType.md)&gt;[] |

#### Returns

`EntityLocalCreatedEvent`

## Properties

### entities \{#entities\}

```ts
readonly entities: RxDBEntityLocalCreatedEventData<EntityType>[];
```

Defined in: [packages/rxdb/src/rxdb-events.ts:338](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L338)

---

### type \{#type\}

```ts
type: 'ENTITY_LOCAL_CREATE' = ENTITY_LOCAL_CREATE_EVENT;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:337](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L337)
