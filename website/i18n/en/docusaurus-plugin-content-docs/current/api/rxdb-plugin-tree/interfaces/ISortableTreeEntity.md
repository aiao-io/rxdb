# ISortableTreeEntity

Defined in: [rxdb-plugin-tree/src/entity/tree-entity.interface.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-tree/src/entity/tree-entity.interface.ts#L32)

Interface for tree entities supporting manual ordering.

On top of [ITreeEntity](ITreeEntity.md), requires the entity to declare a `sortOrder` field (usually produced by fractional indexing such as `generateKeyBetween`). Type constraint for the algorithms behind drag and drop, manual ordering and similar scenarios.

## Remarks

The key type comes from the core ordering module's [SortOrderKey](../../rxdb/type-aliases/SortOrderKey.md) (the single source); a tree node's `sortOrder` may still be null or absent. What is composed is the key type, not the non-null `ISortableEntity`. It is only a type: implementing it does not give an entity the `manualOrder` declaration.

## Extends

- [`ITreeEntity`](ITreeEntity.md)

## Properties

### createdAt \{#createdat\}

```ts
createdAt: Date;
```

Defined in: rxdb/dist/entity/entity.interface.d.ts:112

Creation time

#### Inherited from

[`ITreeEntity`](ITreeEntity.md).[`createdAt`](ITreeEntity.md#createdat)

---

### createdBy? \{#createdby\}

```ts
createdBy?: string | null;
```

Defined in: rxdb/dist/entity/entity.interface.d.ts:120

Creator

#### Inherited from

[`ITreeEntity`](ITreeEntity.md).[`createdBy`](ITreeEntity.md#createdby)

---

### hasChildren? \{#haschildren\}

```ts
hasChildren?: boolean | null;
```

Defined in: [rxdb-plugin-tree/src/entity/tree-entity.interface.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-tree/src/entity/tree-entity.interface.ts#L19)

Whether there are child nodes. Auto-filled by the computed property of `TreeAdjacencyListEntityBase`; read-only for the application layer. This field is `null` for entities without `features.tree.hasChildren` enabled.

#### Inherited from

[`ITreeEntity`](ITreeEntity.md).[`hasChildren`](ITreeEntity.md#haschildren)

---

### id \{#id\}

```ts
id: RxDBEntityId;
```

Defined in: rxdb/dist/entity/entity.interface.d.ts:108

id

#### Inherited from

[`ITreeEntity`](ITreeEntity.md).[`id`](ITreeEntity.md#id)

---

### parentId? \{#parentid\}

```ts
parentId?: RxDBEntityId | null;
```

Defined in: [rxdb-plugin-tree/src/entity/tree-entity.interface.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-tree/src/entity/tree-entity.interface.ts#L14)

Primary key of the parent node. Belongs to the same [RxDBEntityId](../../rxdb/type-aliases/RxDBEntityId.md) domain as [IEntity.id](ITreeEntity.md#id) — a tree's `parentId` points at exactly another node's `id`, so both must allow the same types (`string | number | bigint`); otherwise a tree with numeric primary keys could not be expressed at the type level at all.

#### Inherited from

[`ITreeEntity`](ITreeEntity.md).[`parentId`](ITreeEntity.md#parentid)

---

### sortOrder? \{#sortorder\}

```ts
sortOrder?: string | null;
```

Defined in: [rxdb-plugin-tree/src/entity/tree-entity.interface.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-tree/src/entity/tree-entity.interface.ts#L33)

---

### updatedAt \{#updatedat\}

```ts
updatedAt: Date;
```

Defined in: rxdb/dist/entity/entity.interface.d.ts:116

Update time

#### Inherited from

[`ITreeEntity`](ITreeEntity.md).[`updatedAt`](ITreeEntity.md#updatedat)

---

### updatedBy? \{#updatedby\}

```ts
updatedBy?: string | null;
```

Defined in: rxdb/dist/entity/entity.interface.d.ts:124

Updater

#### Inherited from

[`ITreeEntity`](ITreeEntity.md).[`updatedBy`](ITreeEntity.md#updatedby)
