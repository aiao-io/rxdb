# TabsResult

Defined in: [tabs/tabs-ops.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/tabs/tabs-ops.ts#L24)

The result of a tab operation: the new state, plus the URL to navigate to after the current tab is closed.

## Properties

### next? \{#next\}

```ts
readonly next?: string | null;
```

Defined in: [tabs/tabs-ops.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/tabs/tabs-ops.ts#L28)

The next URL when the active tab is closed; `null` means no tab to go to, decided by the caller (usually back to the home page).

---

### state \{#state\}

```ts
readonly state: TabsState;
```

Defined in: [tabs/tabs-ops.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/tabs/tabs-ops.ts#L26)

The new state.
