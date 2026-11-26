---
sidebar_label: 'RxDBEntityRemoteRemovedEventData⟨T⟩'
---

# RxDBEntityRemoteRemovedEventData`<T>`

Defined in: [packages/rxdb/src/rxdb-events.ts:310](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L310)

The payload of [ENTITY\_REMOTE\_REMOVE\_EVENT](../variables/ENTITY_REMOTE_REMOVE_EVENT.md); `data` is the whole row **before** deletion

## Extends

- `RxDBEntityLocalEventDataBase`&lt;`T`&gt;

## Type Parameters

| Type Parameter                                                                            | Default type                                  |
| ----------------------------------------------------------------------------------------- | --------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../type-aliases/EntityType.md) | [`EntityType`](../type-aliases/EntityType.md) |

## Properties

### branchId? \{#branchid\}

```ts
branchId?: string;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:206](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L206)

Branch ID (remote events)

#### Inherited from

`RxDBEntityLocalEventDataBase.branchId`

---

### data \{#data\}

```ts
data: Readonly<InstanceType<T>>;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:313](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L313)

---

### entity \{#entity\}

```ts
entity: string;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:200](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L200)

Entity name

#### Inherited from

`RxDBEntityLocalEventDataBase.entity`

---

### entityType? \{#entitytype\}

```ts
entityType?: T;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:204](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L204)

Entity type

#### Inherited from

`RxDBEntityLocalEventDataBase.entityType`

---

### id \{#id\}

```ts
id: EntityStaticType<T, 'idType'>;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:202](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L202)

The entity's unique identifier

#### Inherited from

`RxDBEntityLocalEventDataBase.id`

---

### namespace \{#namespace\}

```ts
namespace: string;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:198](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L198)

Namespace

#### Inherited from

`RxDBEntityLocalEventDataBase.namespace`

---

### origin? \{#origin\}

```ts
origin?: "cross-tab";
```

Defined in: [packages/rxdb/src/rxdb-events.ts:210](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L210)

Event origin: undefined = the local current tab, 'cross-tab' = received from other tabs through BroadcastChannel

#### Inherited from

`RxDBEntityLocalEventDataBase.origin`

---

### recordAt \{#recordat\}

```ts
recordAt: Date;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:208](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L208)

Change record time

#### Inherited from

`RxDBEntityLocalEventDataBase.recordAt`

---

### tableSetSuffix? \{#tablesetsuffix\}

```ts
tableSetSuffix?: string;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:218](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L218)

Which writable-checkout shadow table set this row was written on (US-314 B2.3); default is the primary table set.

#### Remarks

Instances accept only events readable from the table set they have mounted, per `WorktreeTableSet.accepts`; the cross-tab gateway forwards it as-is. Events on the primary table set do not carry this field, and on databases without checkouts the event shape is byte-for-byte what it was before.

#### Inherited from

`RxDBEntityLocalEventDataBase.tableSetSuffix`

---

### type \{#type\}

```ts
type: 'INSERT' | 'UPDATE' | 'DELETE' | 'NEW';
```

Defined in: [packages/rxdb/src/rxdb-events.ts:196](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L196)

#### Inherited from

`RxDBEntityLocalEventDataBase.type`
