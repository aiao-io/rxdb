# ShellUiState

Defined in: [layout/ui-state.ts:4](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/ui-state.ts#L4)

The shell's transient UI state, not persisted.

## Properties

### drawerOpen \{#draweropen\}

```ts
readonly drawerOpen: boolean;
```

Defined in: [layout/ui-state.ts:6](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/ui-state.ts#L6)

Whether the mobile sidebar drawer is open.

---

### hoverExpanded \{#hoverexpanded\}

```ts
readonly hoverExpanded: boolean;
```

Defined in: [layout/ui-state.ts:8](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/ui-state.ts#L8)

Whether the collapsed sidebar is temporarily expanded due to hover.

---

### maximized \{#maximized\}

```ts
readonly maximized: boolean;
```

Defined in: [layout/ui-state.ts:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/ui-state.ts#L10)

Content maximized.

---

### navigating \{#navigating\}

```ts
readonly navigating: boolean;
```

Defined in: [layout/ui-state.ts:16](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/ui-state.ts#L16)

Route navigation in progress (drives the top progress bar and the loading overlay).

---

### preferencesOpen \{#preferencesopen\}

```ts
readonly preferencesOpen: boolean;
```

Defined in: [layout/ui-state.ts:12](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/ui-state.ts#L12)

Whether the preferences drawer is open.

---

### refreshKey \{#refreshkey\}

```ts
readonly refreshKey: number;
```

Defined in: [layout/ui-state.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/ui-state.ts#L14)

The page refresh counter: used as the content area's key, a change rebuilds the current page.
