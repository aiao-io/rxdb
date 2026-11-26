# EntityLocalRemovedEvent

Defined in: [packages/rxdb/src/rxdb-events.ts:356](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L356)

Local entity removed event

Fired when an entity is successfully deleted from the database.

## Constructors

### Constructor

```ts
new EntityLocalRemovedEvent(entities): EntityLocalRemovedEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:358](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L358)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `entities` | [`RxDBEntityLocalRemovedEventData`](../interfaces/RxDBEntityLocalRemovedEventData.md)&lt;[`EntityType`](../type-aliases/EntityType.md)&gt;[] |

#### Returns

`EntityLocalRemovedEvent`

## Properties

### entities \{#entities\}

```ts
readonly entities: RxDBEntityLocalRemovedEventData<EntityType>[];
```

Defined in: [packages/rxdb/src/rxdb-events.ts:358](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L358)

***

### type \{#type\}

```ts
type: "ENTITY_LOCAL_REMOVE" = ENTITY_LOCAL_REMOVE_EVENT;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:357](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L357)
