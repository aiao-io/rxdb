---
sidebar_label: "SwitchVersionActions⟨T⟩"
---

# SwitchVersionActions`<T>`

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:345](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L345)

The operations needed to switch branch versions

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) | [`EntityType`](../type-aliases/EntityType.md) |

## Properties

### deletes \{#deletes\}

```ts
deletes: Map<string, SwitchVersionChange<T>>;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:350](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L350)

The entity key set to delete
key format: `${namespace}:${entityName}:${entityId}`

***

### inserts \{#inserts\}

```ts
inserts: Map<string, SwitchVersionChange<T>>;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:362](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L362)

The entity key set to insert
key format: `${namespace}:${entityName}:${entityId}`

***

### updateRxDBChangeSequence? \{#updaterxdbchangesequence\}

```ts
updateRxDBChangeSequence?: number;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:368](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L368)

Updates the RxDBChange sequence number
local only, not synced to the remote

***

### updates \{#updates\}

```ts
updates: Map<string, SwitchVersionChange<T>>;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:356](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L356)

The entity key set to update
key format: `${namespace}:${entityName}:${entityId}`
