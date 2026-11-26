# ListReorderState

Defined in: packages/rxdb-model/dist/entity-list/manual-order-list.d.ts:15

List state used when deciding whether the list allows drag-and-drop reordering

## Properties

### fixedQuery \{#fixedquery\}

```ts
readonly fixedQuery: ListFixedQuery | undefined;
```

Defined in: packages/rxdb-model/dist/entity-list/manual-order-list.d.ts:25

Fixed query passed in from outside

***

### fullyLoaded \{#fullyloaded\}

```ts
readonly fullyLoaded: boolean;
```

Defined in: packages/rxdb-model/dist/entity-list/manual-order-list.d.ts:27

The ordering domain is fully loaded: no next page and not currently loading

***

### hasDrafts \{#hasdrafts\}

```ts
readonly hasDrafts: boolean;
```

Defined in: packages/rxdb-model/dist/entity-list/manual-order-list.d.ts:31

There are draft rows not yet committed to storage

***

### hasPendingEdits \{#haspendingedits\}

```ts
readonly hasPendingEdits: boolean;
```

Defined in: packages/rxdb-model/dist/entity-list/manual-order-list.d.ts:33

There are unfinished cell edit writes

***

### hasReadonlyRows \{#hasreadonlyrows\}

```ts
readonly hasReadonlyRows: boolean;
```

Defined in: packages/rxdb-model/dist/entity-list/manual-order-list.d.ts:29

There are read-only rows (without edit permission)

***

### hasUserFilter \{#hasuserfilter\}

```ts
readonly hasUserFilter: boolean;
```

Defined in: packages/rxdb-model/dist/entity-list/manual-order-list.d.ts:21

The user added conditions in the filter box

***

### metadata \{#metadata\}

```ts
readonly metadata: 
  | ManualOrderListMetadata
  | undefined;
```

Defined in: packages/rxdb-model/dist/entity-list/manual-order-list.d.ts:17

Metadata of the current entity; `undefined` for unregistered entities

***

### reorderPending \{#reorderpending\}

```ts
readonly reorderPending: boolean;
```

Defined in: packages/rxdb-model/dist/entity-list/manual-order-list.d.ts:35

The reorder from the previous drag has not settled yet

***

### selectMode \{#selectmode\}

```ts
readonly selectMode: boolean;
```

Defined in: packages/rxdb-model/dist/entity-list/manual-order-list.d.ts:23

The list is in relation selection mode

***

### sortOrder \{#sortorder\}

```ts
readonly sortOrder: "asc" | "desc" | "normal";
```

Defined in: packages/rxdb-model/dist/entity-list/manual-order-list.d.ts:19

Header sort state; the manual order is only shown when it is `normal` (not sorted by a column)
