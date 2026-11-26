# EntityTableRecord

Defined in: packages/rxdb-model/dist/entity-table/interfaces.d.ts:8

Base interface for generic entity table records

The business layer extends this interface to add domain fields.
`_`-prefixed fields are internal metadata and are not processed by clipboard/edit operations.

## Indexable

```ts
[key: string]: unknown
```

Record field values (field name → value)

## Properties

### \_isAddRow? \{#_isaddrow\}

```ts
_isAddRow?: boolean;
```

Defined in: packages/rxdb-model/dist/entity-table/interfaces.d.ts:14

New template row

***

### \_readonly? \{#_readonly\}

```ts
_readonly?: boolean;
```

Defined in: packages/rxdb-model/dist/entity-table/interfaces.d.ts:12

Readonly row (not editable, not draggable, not deletable)

***

### children? \{#children\}

```ts
children?: EntityTableRecord[];
```

Defined in: packages/rxdb-model/dist/entity-table/interfaces.d.ts:16

Tree-structure child nodes

***

### hierarchyState? \{#hierarchystate\}

```ts
hierarchyState?: "expand" | "collapse";
```

Defined in: packages/rxdb-model/dist/entity-table/interfaces.d.ts:18

VTable tree node expand state
