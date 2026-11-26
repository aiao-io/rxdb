# ListReorderState

Defined in: [packages/rxdb-model/src/entity-list/manual-order-list.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/manual-order-list.ts#L32)

List state used to decide whether the list allows drag-and-drop ordering

## Properties

### fixedQuery \{#fixedquery\}

```ts
readonly fixedQuery: ListFixedQuery | undefined;
```

Defined in: [packages/rxdb-model/src/entity-list/manual-order-list.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/manual-order-list.ts#L42)

Fixed query passed in externally

---

### fullyLoaded \{#fullyloaded\}

```ts
readonly fullyLoaded: boolean;
```

Defined in: [packages/rxdb-model/src/entity-list/manual-order-list.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/manual-order-list.ts#L44)

The ordering domain is fully loaded: no next page and not currently loading

---

### hasDrafts \{#hasdrafts\}

```ts
readonly hasDrafts: boolean;
```

Defined in: [packages/rxdb-model/src/entity-list/manual-order-list.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/manual-order-list.ts#L48)

There are draft rows not yet committed to storage

---

### hasPendingEdits \{#haspendingedits\}

```ts
readonly hasPendingEdits: boolean;
```

Defined in: [packages/rxdb-model/src/entity-list/manual-order-list.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/manual-order-list.ts#L50)

There are unfinished cell edit writes

---

### hasReadonlyRows \{#hasreadonlyrows\}

```ts
readonly hasReadonlyRows: boolean;
```

Defined in: [packages/rxdb-model/src/entity-list/manual-order-list.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/manual-order-list.ts#L46)

There are read-only rows (no edit permission)

---

### hasUserFilter \{#hasuserfilter\}

```ts
readonly hasUserFilter: boolean;
```

Defined in: [packages/rxdb-model/src/entity-list/manual-order-list.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/manual-order-list.ts#L38)

The user added conditions in the filter box

---

### metadata \{#metadata\}

```ts
readonly metadata:
  | ManualOrderListMetadata
  | undefined;
```

Defined in: [packages/rxdb-model/src/entity-list/manual-order-list.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/manual-order-list.ts#L34)

Current entity metadata; `undefined` for unregistered entities

---

### reorderPending \{#reorderpending\}

```ts
readonly reorderPending: boolean;
```

Defined in: [packages/rxdb-model/src/entity-list/manual-order-list.ts:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/manual-order-list.ts#L52)

The previous drag reorder has not settled yet

---

### selectMode \{#selectmode\}

```ts
readonly selectMode: boolean;
```

Defined in: [packages/rxdb-model/src/entity-list/manual-order-list.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/manual-order-list.ts#L40)

The list is in relation selection mode

---

### sortOrder \{#sortorder\}

```ts
readonly sortOrder: "asc" | "desc" | "normal";
```

Defined in: [packages/rxdb-model/src/entity-list/manual-order-list.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/manual-order-list.ts#L36)

Column header sort state; the manual order is shown only when it is `normal` (not sorted by column)
