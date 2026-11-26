# EntityLocalNewEvent

Defined in: [packages/rxdb/src/rxdb-events.ts:326](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L326)

Local entity initialization event

Fired when an entity is instantiated through the constructor (new).
At this point the entity object has been created but not yet persisted to the database.

## Constructors

### Constructor

```ts
new EntityLocalNewEvent(entities): EntityLocalNewEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:328](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L328)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `entities` | [`RxDBEntityLocalNewEventData`](../interfaces/RxDBEntityLocalNewEventData.md)&lt;[`EntityType`](../type-aliases/EntityType.md)&gt;[] |

#### Returns

`EntityLocalNewEvent`

## Properties

### entities \{#entities\}

```ts
readonly entities: RxDBEntityLocalNewEventData<EntityType>[];
```

Defined in: [packages/rxdb/src/rxdb-events.ts:328](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L328)

***

### type \{#type\}

```ts
type: "ENTITY_LOCAL_NEW" = ENTITY_LOCAL_NEW_EVENT;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:327](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L327)
