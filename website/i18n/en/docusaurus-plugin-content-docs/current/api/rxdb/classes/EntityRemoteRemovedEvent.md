# EntityRemoteRemovedEvent

Defined in: [packages/rxdb/src/rxdb-events.ts:374](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L374)

Remote entity removed event

## Constructors

### Constructor

```ts
new EntityRemoteRemovedEvent(entities): EntityRemoteRemovedEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:376](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L376)

#### Parameters

| Parameter  | Type                                                                                                                                           |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `entities` | [`RxDBEntityRemoteRemovedEventData`](../interfaces/RxDBEntityRemoteRemovedEventData.md)&lt;[`EntityType`](../type-aliases/EntityType.md)&gt;[] |

#### Returns

`EntityRemoteRemovedEvent`

## Properties

### entities \{#entities\}

```ts
readonly entities: RxDBEntityRemoteRemovedEventData<EntityType>[];
```

Defined in: [packages/rxdb/src/rxdb-events.ts:376](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L376)

---

### type \{#type\}

```ts
type: 'ENTITY_REMOTE_REMOVE' = ENTITY_REMOTE_REMOVE_EVENT;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:375](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L375)
