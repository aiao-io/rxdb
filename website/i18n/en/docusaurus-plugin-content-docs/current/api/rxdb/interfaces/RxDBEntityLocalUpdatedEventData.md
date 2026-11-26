---
sidebar_label: "RxDBEntityLocalUpdatedEventData⟨T⟩"
---

# RxDBEntityLocalUpdatedEventData`<T>`

Defined in: [packages/rxdb/src/rxdb-events.ts:256](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L256)

Payload of [ENTITY\_LOCAL\_UPDATE\_EVENT](../variables/ENTITY_LOCAL_UPDATE_EVENT.md)

## Remarks

The only shape where both patches are non-`null`: `patch` holds the post-change values and `inversePatch` the pre-change values, **containing only the fields that changed**. undo/redo and conflict merging both rely on this, so the key sets of the two must be identical.

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

Branch ID (remote events)

#### Inherited from

`RxDBEntityLocalEventDataBase.branchId`

***

### entity \{#entity\}

```ts
entity: string;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:200](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L200)

Entity name

#### Inherited from

`RxDBEntityLocalEventDataBase.entity`

***

### entityType? \{#entitytype\}

```ts
entityType?: T;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:204](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L204)

Entity type

#### Inherited from

`RxDBEntityLocalEventDataBase.entityType`

***

### id \{#id\}

```ts
id: EntityStaticType<T, "idType">;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:202](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L202)

Unique identifier of the entity

#### Inherited from

`RxDBEntityLocalEventDataBase.id`

***

### inversePatch \{#inversepatch\}

```ts
inversePatch: Readonly<Partial<InstanceType<T>>>;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:260](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L260)

***

### namespace \{#namespace\}

```ts
namespace: string;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:198](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L198)

Namespace

#### Inherited from

`RxDBEntityLocalEventDataBase.namespace`

***

### origin? \{#origin\}

```ts
origin?: "cross-tab";
```

Defined in: [packages/rxdb/src/rxdb-events.ts:210](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L210)

Event origin: undefined = the current local tab, 'cross-tab' = received from another tab via BroadcastChannel

#### Inherited from

`RxDBEntityLocalEventDataBase.origin`

***

### patch \{#patch\}

```ts
patch: Readonly<Partial<InstanceType<T>>>;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:259](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L259)

***

### recordAt \{#recordat\}

```ts
recordAt: Date;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:208](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L208)

Time the change was recorded

#### Inherited from

`RxDBEntityLocalEventDataBase.recordAt`

***

### tableSetSuffix? \{#tablesetsuffix\}

```ts
tableSetSuffix?: string;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:218](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L218)

Which writable checkout's shadow tables this row is written to (US-314 B2.3); the main table set when absent.

#### Remarks

Instances only receive events readable from the table set they are attached to, per `WorktreeTableSet.accepts`; the cross-tab gateway forwards them as-is. Events on the main table set do not carry this field, and on databases without checkouts the event shape is byte-for-byte the same as before.

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
