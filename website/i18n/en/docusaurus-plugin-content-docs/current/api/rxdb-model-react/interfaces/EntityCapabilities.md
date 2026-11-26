# EntityCapabilities

Defined in: packages/rxdb-model/dist/entity-capabilities.d.ts:5

UI operations allowed for the entity on public write entrances

## Properties

### canCreate \{#cancreate\}

```ts
readonly canCreate: boolean;
```

Defined in: packages/rxdb-model/dist/entity-capabilities.d.ts:7

Can create: `create` is `'both'`

---

### canDelete \{#candelete\}

```ts
readonly canDelete: boolean;
```

Defined in: packages/rxdb-model/dist/entity-capabilities.d.ts:11

Existing rows can be deleted: `delete` is `'both'`

---

### canEdit \{#canedit\}

```ts
readonly canEdit: boolean;
```

Defined in: packages/rxdb-model/dist/entity-capabilities.d.ts:9

Existing rows can be edited: `update` is `'both'`; otherwise the rows are read-only and the detail opens in view mode
