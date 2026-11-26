# EntityTableRecord

Defined in: [packages/rxdb-model/src/entity-table/interfaces.ts:9](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/interfaces.ts#L9)

The base interface for a generic entity table record.

The business layer extends this interface to add domain fields.
Fields with a `_` prefix are internal metadata and are not processed by clipboard/editing operations.

## Indexable

```ts
[key: string]: unknown
```

The record field values (field name → value)

## Properties

### \_isAddRow? \{#_isaddrow\}

```ts
_isAddRow?: boolean;
```

Defined in: [packages/rxdb-model/src/entity-table/interfaces.ts:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/interfaces.ts#L15)

A new-row template

***

### \_readonly? \{#_readonly\}

```ts
_readonly?: boolean;
```

Defined in: [packages/rxdb-model/src/entity-table/interfaces.ts:13](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/interfaces.ts#L13)

A read-only row (not editable, not draggable, not deletable)

***

### children? \{#children\}

```ts
children?: EntityTableRecord[];
```

Defined in: [packages/rxdb-model/src/entity-table/interfaces.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/interfaces.ts#L17)

Child nodes of the tree structure

***

### hierarchyState? \{#hierarchystate\}

```ts
hierarchyState?: "expand" | "collapse";
```

Defined in: [packages/rxdb-model/src/entity-table/interfaces.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/interfaces.ts#L19)

The VTable tree node expansion state
