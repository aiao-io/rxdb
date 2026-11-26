# TabsState

Defined in: [tabs/tabs-ops.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/tabs/tabs-ops.ts#L14)

The tab state.

## Properties

### activeKey \{#activekey\}

```ts
readonly activeKey: string | null;
```

Defined in: [tabs/tabs-ops.ts:18](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/tabs/tabs-ops.ts#L18)

The current tab key.

***

### history \{#history\}

```ts
readonly history: readonly string[];
```

Defined in: [tabs/tabs-ops.ts:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/tabs/tabs-ops.ts#L20)

The visit history, most recently visited first.

***

### tabs \{#tabs\}

```ts
readonly tabs: readonly TabItem[];
```

Defined in: [tabs/tabs-ops.ts:16](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/tabs/tabs-ops.ts#L16)

The tabs, pinned ones first.
