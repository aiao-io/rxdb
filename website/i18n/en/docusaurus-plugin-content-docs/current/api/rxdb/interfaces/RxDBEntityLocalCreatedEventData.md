---
sidebar_label: "RxDBEntityLocalCreatedEventData⟨T⟩"
---

# RxDBEntityLocalCreatedEventData`<T>`

Defined in: [packages/rxdb/src/rxdb-events.ts:242](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L242)

The payload of [ENTITY\_LOCAL\_CREATE\_EVENT](../variables/ENTITY_LOCAL_CREATE_EVENT.md).

## Remarks

`patch` is the **complete entity** (not `Partial`): the row has just been inserted and all fields are settled,
including the ones backfilled by the database. `inversePatch` is always `null` — the inverse of an insert is a
delete, expressed by the id itself and needing no patch.

## Extends

- `RxDBEntityLocalEventDataBase`&lt;`T`&gt;

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) | [`EntityType`](../type-aliases/EntityType.md) |

## Properties

### branchId? \{#branchid\}

```ts
branchId?: string;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:206](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L206)

Branch ID (remote events).

#### Inherited from

`RxDBEntityLocalEventDataBase.branchId`

***

### entity \{#entity\}

```ts
entity: string;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:200](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L200)

Entity name.

#### Inherited from

`RxDBEntityLocalEventDataBase.entity`

***

### entityType? \{#entitytype\}

```ts
entityType?: T;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:204](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L204)

Entity type.

#### Inherited from

`RxDBEntityLocalEventDataBase.entityType`

***

### id \{#id\}

```ts
id: EntityStaticType<T, "idType">;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:202](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L202)

Unique identifier of the entity.

#### Inherited from

`RxDBEntityLocalEventDataBase.id`

***

### inversePatch \{#inversepatch\}

```ts
inversePatch: null;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:246](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L246)

***

### namespace \{#namespace\}

```ts
namespace: string;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:198](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L198)

Namespace.

#### Inherited from

`RxDBEntityLocalEventDataBase.namespace`

***

### origin? \{#origin\}

```ts
origin?: "cross-tab";
```

Defined in: [packages/rxdb/src/rxdb-events.ts:210](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L210)

Event origin: undefined = the local current tab, 'cross-tab' = received from another tab via BroadcastChannel.

#### Inherited from

`RxDBEntityLocalEventDataBase.origin`

***

### patch \{#patch\}

```ts
patch: Readonly<InstanceType<T>>;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:245](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L245)

***

### recordAt \{#recordat\}

```ts
recordAt: Date;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:208](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L208)

When the change was recorded.

#### Inherited from

`RxDBEntityLocalEventDataBase.recordAt`

***

### tableSetSuffix? \{#tablesetsuffix\}

```ts
tableSetSuffix?: string;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:218](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L218)

Which writable checkout's shadow tables this row was written to (US-314 B2.3); absent means the primary table set.

#### Remarks

An instance only receives events readable from the table set it is attached to, per `WorktreeTableSet.accepts`;
the cross-tab gateway forwards them as-is. Events on the primary table set do not carry this field, so the
event shape in a database without checkouts is word-for-word the same as before.

#### Inherited from

`RxDBEntityLocalEventDataBase.tableSetSuffix`

***

### type \{#type\}

```ts
type: "INSERT" | "UPDATE" | "DELETE" | "NEW";
```

Defined in: [packages/rxdb/src/rxdb-events.ts:196](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L196)

#### Inherited from

`RxDBEntityLocalEventDataBase.type`
