# ITreeEntity

Defined in: [rxdb-plugin-tree/src/entity/tree-entity.interface.ts:8](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-tree/src/entity/tree-entity.interface.ts#L8)

Base entity interface
Defines the basic properties shared by all entities, to sync better with remote data
All entity classes should implement this interface

## Extends

- [`IEntity`](../../rxdb/interfaces/IEntity.md)

## Extended by

- [`ISortableTreeEntity`](ISortableTreeEntity.md)

## Properties

### createdAt \{#createdat\}

```ts
createdAt: Date;
```

Defined in: rxdb/dist/entity/entity.interface.d.ts:112

Creation time

#### Inherited from

[`IEntity`](../../rxdb/interfaces/IEntity.md).[`createdAt`](../../rxdb/interfaces/IEntity.md#createdat)

---

### createdBy? \{#createdby\}

```ts
createdBy?: string | null;
```

Defined in: rxdb/dist/entity/entity.interface.d.ts:120

Creator

#### Inherited from

[`IEntity`](../../rxdb/interfaces/IEntity.md).[`createdBy`](../../rxdb/interfaces/IEntity.md#createdby)

---

### hasChildren? \{#haschildren\}

```ts
hasChildren?: boolean | null;
```

Defined in: [rxdb-plugin-tree/src/entity/tree-entity.interface.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-tree/src/entity/tree-entity.interface.ts#L19)

Whether there are child nodes. Auto-filled by the computed property of `TreeAdjacencyListEntityBase`; read-only for the application layer. This field is `null` for entities without `features.tree.hasChildren` enabled.

---

### id \{#id\}

```ts
id: RxDBEntityId;
```

Defined in: rxdb/dist/entity/entity.interface.d.ts:108

id

#### Inherited from

[`IEntity`](../../rxdb/interfaces/IEntity.md).[`id`](../../rxdb/interfaces/IEntity.md#id)

---

### parentId? \{#parentid\}

```ts
parentId?: RxDBEntityId | null;
```

Defined in: [rxdb-plugin-tree/src/entity/tree-entity.interface.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-tree/src/entity/tree-entity.interface.ts#L14)

Primary key of the parent node. Belongs to the same [RxDBEntityId](../../rxdb/type-aliases/RxDBEntityId.md) domain as [IEntity.id](#id) — a tree's `parentId` points at exactly another node's `id`, so both must allow the same types (`string | number | bigint`); otherwise a tree with numeric primary keys could not be expressed at the type level at all.

---

### updatedAt \{#updatedat\}

```ts
updatedAt: Date;
```

Defined in: rxdb/dist/entity/entity.interface.d.ts:116

Update time

#### Inherited from

[`IEntity`](../../rxdb/interfaces/IEntity.md).[`updatedAt`](../../rxdb/interfaces/IEntity.md#updatedat)

---

### updatedBy? \{#updatedby\}

```ts
updatedBy?: string | null;
```

Defined in: rxdb/dist/entity/entity.interface.d.ts:124

Updater

#### Inherited from

[`IEntity`](../../rxdb/interfaces/IEntity.md).[`updatedBy`](../../rxdb/interfaces/IEntity.md#updatedby)
