# EntityTableRecord

Defined in: packages/rxdb-model/dist/entity-table/interfaces.d.ts:8

Base interface for generic entity table records

Business layers extend this interface to add domain fields.
Fields prefixed with `_` are internal metadata and are not processed by clipboard/edit operations.

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

New-row template

---

### \_readonly? \{#_readonly\}

```ts
_readonly?: boolean;
```

Defined in: packages/rxdb-model/dist/entity-table/interfaces.d.ts:12

Read-only row (not editable, not draggable, not deletable)

---

### children? \{#children\}

```ts
children?: EntityTableRecord[];
```

Defined in: packages/rxdb-model/dist/entity-table/interfaces.d.ts:16

Child nodes of the tree structure

---

### hierarchyState? \{#hierarchystate\}

```ts
hierarchyState?: "expand" | "collapse";
```

Defined in: packages/rxdb-model/dist/entity-table/interfaces.d.ts:18

VTable tree node expand state
