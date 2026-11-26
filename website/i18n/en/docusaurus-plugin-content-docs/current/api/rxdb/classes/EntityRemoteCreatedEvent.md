# EntityRemoteCreatedEvent

Defined in: [packages/rxdb/src/rxdb-events.ts:362](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L362)

Remote entity created event

## Constructors

### Constructor

```ts
new EntityRemoteCreatedEvent(entities): EntityRemoteCreatedEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:364](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L364)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `entities` | [`RxDBEntityRemoteCreatedEventData`](../interfaces/RxDBEntityRemoteCreatedEventData.md)&lt;[`EntityType`](../type-aliases/EntityType.md)&gt;[] |

#### Returns

`EntityRemoteCreatedEvent`

## Properties

### entities \{#entities\}

```ts
readonly entities: RxDBEntityRemoteCreatedEventData<EntityType>[];
```

Defined in: [packages/rxdb/src/rxdb-events.ts:364](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L364)

***

### type \{#type\}

```ts
type: "ENTITY_REMOTE_CREATE" = ENTITY_REMOTE_CREATE_EVENT;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:363](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L363)
