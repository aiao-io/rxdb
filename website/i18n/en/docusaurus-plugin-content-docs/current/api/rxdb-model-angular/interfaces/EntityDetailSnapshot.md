# EntityDetailSnapshot

Defined in: packages/rxdb-model/dist/entity-detail/headless.d.ts:4

Snapshot of the detail page mode, tabs, form draft and save lifecycle.

## Properties

### activeTab \{#activetab\}

```ts
readonly activeTab: string;
```

Defined in: packages/rxdb-model/dist/entity-detail/headless.d.ts:6

---

### error \{#error\}

```ts
readonly error: unknown;
```

Defined in: packages/rxdb-model/dist/entity-detail/headless.d.ts:11

---

### form \{#form\}

```ts
readonly form: EntityFormSnapshot;
```

Defined in: packages/rxdb-model/dist/entity-detail/headless.d.ts:9

The form snapshot of the same detail draft.

---

### mode \{#mode\}

```ts
readonly mode: "view" | "edit" | "create";
```

Defined in: packages/rxdb-model/dist/entity-detail/headless.d.ts:5

---

### open \{#open\}

```ts
readonly open: boolean;
```

Defined in: packages/rxdb-model/dist/entity-detail/headless.d.ts:12

---

### saving \{#saving\}

```ts
readonly saving: boolean;
```

Defined in: packages/rxdb-model/dist/entity-detail/headless.d.ts:10

---

### tabs \{#tabs\}

```ts
readonly tabs: readonly DetailTab[];
```

Defined in: packages/rxdb-model/dist/entity-detail/headless.d.ts:7
