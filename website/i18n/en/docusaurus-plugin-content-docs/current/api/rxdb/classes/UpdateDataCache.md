---
sidebar_label: "UpdateDataCache⟨T⟩"
---

# UpdateDataCache`<T>`

Defined in: [packages/rxdb/src/query/merge-update.utils.ts:123](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/query/merge-update.utils.ts#L123)

Cache manager for update data
Used to cache serialized entity data and avoid repeated serialization

## Remarks

Multiple events with the same id are folded into one via foldUpdate at construction time; what `getData` / `getSerializedUpdate` /
`getSerializedBefore` see is the merged one.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) |

## Constructors

### Constructor

```ts
new UpdateDataCache<T>(data, serialize): UpdateDataCache<T>;
```

Defined in: [packages/rxdb/src/query/merge-update.utils.ts:128](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/query/merge-update.utils.ts#L128)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `data` | [`RxDBEntityLocalUpdatedEventData`](../interfaces/RxDBEntityLocalUpdatedEventData.md)&lt;`T`&gt;[] |
| `serialize` | (`event`) => `InstanceType`&lt;`T`&gt; |

#### Returns

`UpdateDataCache`&lt;`T`&gt;

## Methods

### getData() \{#getdata\}

```ts
getData(id): 
  | RxDBEntityLocalUpdatedEventData<T>
  | undefined;
```

Defined in: [packages/rxdb/src/query/merge-update.utils.ts:183](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/query/merge-update.utils.ts#L183)

Gets the raw update data

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | [`RxDBEntityId`](../type-aliases/RxDBEntityId.md) |

#### Returns

  \| [`RxDBEntityLocalUpdatedEventData`](../interfaces/RxDBEntityLocalUpdatedEventData.md)&lt;`T`&gt;
  \| `undefined`

***

### getSerializedBefore() \{#getserializedbefore\}

```ts
getSerializedBefore(id): InstanceType<T> | undefined;
```

Defined in: [packages/rxdb/src/query/merge-update.utils.ts:169](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/query/merge-update.utils.ts#L169)

Gets the serialized pre-update data

inversePatch only contains the old values of the changed fields; rebuilding from it alone loses all unchanged fields, causing compound
where judgments to go wrong. Here the post-update entity is used as the base with the batch-merged inversePatch applied on top, filling in the unchanged fields.
The returned value is a brand-new plain object and never mutates the shared entity cache instance.

The post-update entity is taken from the identity cache: on a cache miss it only has the fields in the patch, so the before-state built on top is equally incomplete.
The cases that cannot be completed are blocked by the UPDATE gate before the incremental merge (see `need_refresh_update.ts`).

The before-state is cached by id with only one copy, so old values from the caller are not accepted: even if provided, the caller would only get the one computed first.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | [`RxDBEntityId`](../type-aliases/RxDBEntityId.md) | Entity id |

#### Returns

`InstanceType`&lt;`T`&gt; \| `undefined`

***

### getSerializedUpdate() \{#getserializedupdate\}

```ts
getSerializedUpdate(id): InstanceType<T> | undefined;
```

Defined in: [packages/rxdb/src/query/merge-update.utils.ts:142](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/query/merge-update.utils.ts#L142)

Gets the serialized update data

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | [`RxDBEntityId`](../type-aliases/RxDBEntityId.md) |

#### Returns

`InstanceType`&lt;`T`&gt; \| `undefined`
