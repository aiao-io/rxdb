---
sidebar_label: 'RxDBEntityLocalRemovedEventData⟨T⟩'
---

# RxDBEntityLocalRemovedEventData`<T>`

Defined in: [packages/rxdb/src/rxdb-events.ts:270](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L270)

The payload of [ENTITY\_LOCAL\_REMOVE\_EVENT](../variables/ENTITY_LOCAL_REMOVE_EVENT.md)

## Remarks

Exactly the opposite of creation: `patch` is always `null`, `inversePatch` carries the fields before the removal,
and restoration (see `RestoreEntityOptions`) replays exactly that.

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

Entity unique identifier

#### Inherited from

`RxDBEntityLocalEventDataBase.id`

---

### inversePatch \{#inversepatch\}

```ts
inversePatch: Readonly<Partial<InstanceType<T>>>;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:274](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L274)

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

Event origin: undefined = the local current tab, 'cross-tab' = received from another tab via BroadcastChannel

#### Inherited from

`RxDBEntityLocalEventDataBase.origin`

---

### patch \{#patch\}

```ts
patch: null;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:273](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L273)

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

Which writable checkout's shadow tables this row was written to (US-314 B2.3); the main table set when absent.

#### Remarks

An instance only accepts, by `WorktreeTableSet.accepts`, the events readable from the table set it is mounted on; the cross-tab gateway forwards them unchanged.
Events on the main table set do not carry this field; the event shape of a database without checkouts is verbatim the same as before.

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
