# DetailTableTab

Defined in: packages/rxdb-model/dist/entity-detail/interfaces.d.ts:27

Table tab configuration (shows relation data of related entities)

## Extends

- [`DetailTabBase`](DetailTabBase.md)

## Properties

### foreignKeyField? \{#foreignkeyfield\}

```ts
foreignKeyField?: string;
```

Defined in: packages/rxdb-model/dist/entity-detail/interfaces.d.ts:39

ONE_TO_MANY: the foreign-key field in the related entity pointing to the current entity, e.g. 'ownerId'

***

### key \{#key\}

```ts
key: string;
```

Defined in: packages/rxdb-model/dist/entity-detail/interfaces.d.ts:11

Unique identifier of the tab

#### Inherited from

[`DetailTabBase`](DetailTabBase.md).[`key`](DetailTabBase.md#key)

***

### label \{#label\}

```ts
label: string;
```

Defined in: packages/rxdb-model/dist/entity-detail/interfaces.d.ts:13

Display name of the tab

#### Inherited from

[`DetailTabBase`](DetailTabBase.md).[`label`](DetailTabBase.md#label)

***

### mappedProperty? \{#mappedproperty\}

```ts
mappedProperty?: string;
```

Defined in: packages/rxdb-model/dist/entity-detail/interfaces.d.ts:41

MANY_TO_MANY: the relation property name in the related entity pointing to the current entity, e.g. 'orderItems'

***

### relatedEntityName \{#relatedentityname\}

```ts
relatedEntityName: string;
```

Defined in: packages/rxdb-model/dist/entity-detail/interfaces.d.ts:33

Related entity name

***

### relatedNamespace \{#relatednamespace\}

```ts
relatedNamespace: string;
```

Defined in: packages/rxdb-model/dist/entity-detail/interfaces.d.ts:35

Namespace of the related entity

***

### relationKind \{#relationkind\}

```ts
relationKind: RelationKind;
```

Defined in: packages/rxdb-model/dist/entity-detail/interfaces.d.ts:37

Relation kind

***

### relationName \{#relationname\}

```ts
relationName: string;
```

Defined in: packages/rxdb-model/dist/entity-detail/interfaces.d.ts:31

Relation name

***

### type \{#type\}

```ts
type: "table";
```

Defined in: packages/rxdb-model/dist/entity-detail/interfaces.d.ts:29

Tab type: table

#### Overrides

[`DetailTabBase`](DetailTabBase.md).[`type`](DetailTabBase.md#type)
