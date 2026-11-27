# RemoteEntityInvalidatedEvent

Defined in: [packages/rxdb/src/rxdb-events.ts:638](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L638)

Remote entity invalidated event (US-023).

## Remarks

The payload deliberately has only the entity name and namespace: one more place that could carry row data would invite someone to stuff
the push's row body in as the authoritative value written locally — while `QueryCache`'s authoritative values can only come from
the `fetchMetadata` + `findByIds` pull.

## Constructors

### Constructor

```ts
new RemoteEntityInvalidatedEvent(namespace, entity): RemoteEntityInvalidatedEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:641](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L641)

#### Parameters

| Parameter   | Type     | Description |
| ----------- | -------- | ----------- |
| `namespace` | `string` | Namespace   |
| `entity`    | `string` | Entity name |

#### Returns

`RemoteEntityInvalidatedEvent`

## Properties

### entity \{#entity\}

```ts
readonly entity: string;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:645](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L645)

Entity name

---

### namespace \{#namespace\}

```ts
readonly namespace: string;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:643](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L643)

Namespace

---

### type \{#type\}

```ts
readonly type: "REMOTE_ENTITY_INVALIDATED" = REMOTE_ENTITY_INVALIDATED_EVENT;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:639](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L639)
