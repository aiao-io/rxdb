# EntityDetailSnapshot

Defined in: [packages/rxdb-model/src/entity-detail/headless.ts:11](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-detail/headless.ts#L11)

Snapshot of the detail page mode, tabs, form draft, and save lifecycle.

## Properties

### activeTab \{#activetab\}

```ts
readonly activeTab: string;
```

Defined in: [packages/rxdb-model/src/entity-detail/headless.ts:13](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-detail/headless.ts#L13)

---

### error \{#error\}

```ts
readonly error: unknown;
```

Defined in: [packages/rxdb-model/src/entity-detail/headless.ts:18](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-detail/headless.ts#L18)

---

### form \{#form\}

```ts
readonly form: EntityFormSnapshot;
```

Defined in: [packages/rxdb-model/src/entity-detail/headless.ts:16](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-detail/headless.ts#L16)

Form snapshot of the same detail draft.

---

### mode \{#mode\}

```ts
readonly mode: "create" | "view" | "edit";
```

Defined in: [packages/rxdb-model/src/entity-detail/headless.ts:12](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-detail/headless.ts#L12)

---

### open \{#open\}

```ts
readonly open: boolean;
```

Defined in: [packages/rxdb-model/src/entity-detail/headless.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-detail/headless.ts#L19)

---

### saving \{#saving\}

```ts
readonly saving: boolean;
```

Defined in: [packages/rxdb-model/src/entity-detail/headless.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-detail/headless.ts#L17)

---

### tabs \{#tabs\}

```ts
readonly tabs: readonly DetailTab[];
```

Defined in: [packages/rxdb-model/src/entity-detail/headless.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-detail/headless.ts#L14)
