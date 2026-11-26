# IEntity

Defined in: [packages/rxdb/src/entity/entity.interface.ts:164](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity.interface.ts#L164)

Entity base interface
Defines the basic properties shared by all entities, to sync better with remote data
All entity classes should implement this interface

## Extended by

- [`ITreeEntity`](../../rxdb-plugin-tree/interfaces/ITreeEntity.md)

## Properties

### createdAt \{#createdat\}

```ts
createdAt: Date;
```

Defined in: [packages/rxdb/src/entity/entity.interface.ts:173](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity.interface.ts#L173)

Creation time

***

### createdBy? \{#createdby\}

```ts
createdBy?: string | null;
```

Defined in: [packages/rxdb/src/entity/entity.interface.ts:183](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity.interface.ts#L183)

Created by

***

### id \{#id\}

```ts
id: RxDBEntityId;
```

Defined in: [packages/rxdb/src/entity/entity.interface.ts:168](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity.interface.ts#L168)

id

***

### updatedAt \{#updatedat\}

```ts
updatedAt: Date;
```

Defined in: [packages/rxdb/src/entity/entity.interface.ts:178](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity.interface.ts#L178)

Update time

***

### updatedBy? \{#updatedby\}

```ts
updatedBy?: string | null;
```

Defined in: [packages/rxdb/src/entity/entity.interface.ts:188](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity.interface.ts#L188)

Updated by
