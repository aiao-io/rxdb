# DetailTableTab

Defined in: [packages/rxdb-model/src/entity-detail/interfaces.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-detail/interfaces.ts#L35)

Table tab configuration (shows relation data of a related entity)

## Extends

- [`DetailTabBase`](DetailTabBase.md)

## Properties

### foreignKeyField? \{#foreignkeyfield\}

```ts
foreignKeyField?: string;
```

Defined in: [packages/rxdb-model/src/entity-detail/interfaces.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-detail/interfaces.ts#L47)

ONE_TO_MANY: foreign key field on the related entity that points to the current entity, e.g. 'ownerId'

***

### key \{#key\}

```ts
key: string;
```

Defined in: [packages/rxdb-model/src/entity-detail/interfaces.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-detail/interfaces.ts#L17)

Unique identifier of the tab

#### Inherited from

[`DetailTabBase`](DetailTabBase.md).[`key`](DetailTabBase.md#key)

***

### label \{#label\}

```ts
label: string;
```

Defined in: [packages/rxdb-model/src/entity-detail/interfaces.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-detail/interfaces.ts#L19)

Display name of the tab

#### Inherited from

[`DetailTabBase`](DetailTabBase.md).[`label`](DetailTabBase.md#label)

***

### mappedProperty? \{#mappedproperty\}

```ts
mappedProperty?: string;
```

Defined in: [packages/rxdb-model/src/entity-detail/interfaces.ts:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-detail/interfaces.ts#L49)

MANY_TO_MANY: name of the relation property on the related entity that points to the current entity, e.g. 'orderItems'

***

### relatedEntityName \{#relatedentityname\}

```ts
relatedEntityName: string;
```

Defined in: [packages/rxdb-model/src/entity-detail/interfaces.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-detail/interfaces.ts#L41)

Name of the related entity

***

### relatedNamespace \{#relatednamespace\}

```ts
relatedNamespace: string;
```

Defined in: [packages/rxdb-model/src/entity-detail/interfaces.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-detail/interfaces.ts#L43)

Namespace of the related entity

***

### relationKind \{#relationkind\}

```ts
relationKind: RelationKind;
```

Defined in: [packages/rxdb-model/src/entity-detail/interfaces.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-detail/interfaces.ts#L45)

Relation type

***

### relationName \{#relationname\}

```ts
relationName: string;
```

Defined in: [packages/rxdb-model/src/entity-detail/interfaces.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-detail/interfaces.ts#L39)

Relation name

***

### type \{#type\}

```ts
type: "table";
```

Defined in: [packages/rxdb-model/src/entity-detail/interfaces.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-detail/interfaces.ts#L37)

Tab type: table

#### Overrides

[`DetailTabBase`](DetailTabBase.md).[`type`](DetailTabBase.md#type)
