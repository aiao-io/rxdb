# EntityRemoteUpdatedEvent

Defined in: [packages/rxdb/src/rxdb-events.ts:368](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L368)

Remote entity updated event

## Constructors

### Constructor

```ts
new EntityRemoteUpdatedEvent(entities): EntityRemoteUpdatedEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:370](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L370)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `entities` | [`RxDBEntityRemoteUpdatedEventData`](../interfaces/RxDBEntityRemoteUpdatedEventData.md)&lt;[`EntityType`](../type-aliases/EntityType.md)&gt;[] |

#### Returns

`EntityRemoteUpdatedEvent`

## Properties

### entities \{#entities\}

```ts
readonly entities: RxDBEntityRemoteUpdatedEventData<EntityType>[];
```

Defined in: [packages/rxdb/src/rxdb-events.ts:370](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L370)

***

### type \{#type\}

```ts
type: "ENTITY_REMOTE_UPDATE" = ENTITY_REMOTE_UPDATE_EVENT;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:369](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L369)
