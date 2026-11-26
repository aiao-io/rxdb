# EntityLocalUpdatedEvent

Defined in: [packages/rxdb/src/rxdb-events.ts:346](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L346)

Local entity updated event

Fired when entity data is updated in the database.

## Constructors

### Constructor

```ts
new EntityLocalUpdatedEvent(entities): EntityLocalUpdatedEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:348](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L348)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `entities` | [`RxDBEntityLocalUpdatedEventData`](../interfaces/RxDBEntityLocalUpdatedEventData.md)&lt;[`EntityType`](../type-aliases/EntityType.md)&gt;[] |

#### Returns

`EntityLocalUpdatedEvent`

## Properties

### entities \{#entities\}

```ts
readonly entities: RxDBEntityLocalUpdatedEventData<EntityType>[];
```

Defined in: [packages/rxdb/src/rxdb-events.ts:348](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L348)

***

### type \{#type\}

```ts
type: "ENTITY_LOCAL_UPDATE" = ENTITY_LOCAL_UPDATE_EVENT;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:347](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L347)
