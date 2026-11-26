# EntityListProps

Defined in: [packages/rxdb-model-react/src/entity-list/entity-list.tsx:159](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-list/entity-list.tsx#L159)

Props of [EntityList](../functions/EntityList.md).

## Properties

### alreadyLinkedIds? \{#alreadylinkedids\}

```ts
alreadyLinkedIds?: Set<string>;
```

Defined in: [packages/rxdb-model-react/src/entity-list/entity-list.tsx:185](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-list/entity-list.tsx#L185)

Set of entity IDs that are already linked (filtered out in selection mode).

***

### creationChain? \{#creationchain\}

```ts
creationChain?: string[];
```

Defined in: [packages/rxdb-model-react/src/entity-list/entity-list.tsx:175](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-list/entity-list.tsx#L175)

Entity types in the creation chain (namespace:name), used to prevent circular creation.

***

### draftParentEntity? \{#draftparententity\}

```ts
draftParentEntity?: EntityInstance | null;
```

Defined in: [packages/rxdb-model-react/src/entity-list/entity-list.tsx:171](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-list/entity-list.tsx#L171)

Draft parent entity (cascade creation scenarios).

***

### editChain? \{#editchain\}

```ts
editChain?: string[];
```

Defined in: [packages/rxdb-model-react/src/entity-list/entity-list.tsx:177](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-list/entity-list.tsx#L177)

Stack of record IDs with an open detail dialog (including ancestor records), to prevent infinite nesting.

***

### fixedFormData? \{#fixedformdata\}

```ts
fixedFormData?: EntityFormData;
```

Defined in: [packages/rxdb-model-react/src/entity-list/entity-list.tsx:169](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-list/entity-list.tsx#L169)

Pre-filled foreign key data (passed to the child entity dialog on cascade creation).

***

### fixedQuery? \{#fixedquery\}

```ts
fixedQuery?: FilterQuery;
```

Defined in: [packages/rxdb-model-react/src/entity-list/entity-list.tsx:165](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-list/entity-list.tsx#L165)

Fixed query condition, AND-combined with the user's filter condition (used for relationship property filtering).

***

### initialFilter? \{#initialfilter\}

```ts
initialFilter?: string;
```

Defined in: [packages/rxdb-model-react/src/entity-list/entity-list.tsx:167](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-list/entity-list.tsx#L167)

Initial filter condition passed in from external navigation (a JSON string).

***

### mode? \{#mode\}

```ts
mode?: "select" | "default";
```

Defined in: [packages/rxdb-model-react/src/entity-list/entity-list.tsx:183](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-list/entity-list.tsx#L183)

List mode: default = normal list, select = selection mode (with a checkbox column).

***

### name \{#name\}

```ts
name: string;
```

Defined in: [packages/rxdb-model-react/src/entity-list/entity-list.tsx:163](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-list/entity-list.tsx#L163)

Entity name (required).

***

### namespace \{#namespace\}

```ts
namespace: string;
```

Defined in: [packages/rxdb-model-react/src/entity-list/entity-list.tsx:161](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-list/entity-list.tsx#L161)

Entity namespace (required).

***

### onSelectionCancelled? \{#onselectioncancelled\}

```ts
onSelectionCancelled?: () => void;
```

Defined in: [packages/rxdb-model-react/src/entity-list/entity-list.tsx:191](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-list/entity-list.tsx#L191)

Selection mode: fired when the selection is cancelled.

#### Returns

`void`

***

### onSelectionConfirmed? \{#onselectionconfirmed\}

```ts
onSelectionConfirmed?: (entities) => void;
```

Defined in: [packages/rxdb-model-react/src/entity-list/entity-list.tsx:189](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-list/entity-list.tsx#L189)

Selection mode: fired when the selection is confirmed, carrying the selected entity instances.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `entities` | [`EntityInstance`](../type-aliases/EntityInstance.md)[] |

#### Returns

`void`

***

### onViewEntity? \{#onviewentity\}

```ts
onViewEntity?: (record) => void;
```

Defined in: [packages/rxdb-model-react/src/entity-list/entity-list.tsx:187](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-list/entity-list.tsx#L187)

Fired when the "View" button is clicked, carrying the corresponding row record.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `record` | [`EntityTableRecord`](EntityTableRecord.md) |

#### Returns

`void`

***

### parentEntity? \{#parententity\}

```ts
parentEntity?: EntityInstance | null;
```

Defined in: [packages/rxdb-model-react/src/entity-list/entity-list.tsx:181](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-list/entity-list.tsx#L181)

Parent entity instance (used for M2M relationship operations).

***

### parentRelationName? \{#parentrelationname\}

```ts
parentRelationName?: string;
```

Defined in: [packages/rxdb-model-react/src/entity-list/entity-list.tsx:173](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-list/entity-list.tsx#L173)

Name of the relationship property on the parent entity (e.g. 'children').

***

### relationKind? \{#relationkind\}

```ts
relationKind?: RelationKind;
```

Defined in: [packages/rxdb-model-react/src/entity-list/entity-list.tsx:179](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-list/entity-list.tsx#L179)

Relationship kind (enables the selection mode entry when MANY_TO_MANY).
