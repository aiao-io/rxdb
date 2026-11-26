# TabsStoreOptions

Defined in: [tabs/tabs-store.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/tabs/tabs-store.ts#L38)

The construction options of [TabsStore](../classes/TabsStore.md).

## Properties

### config \{#config\}

```ts
readonly config: ReadableStore<TabsConfig>;
```

Defined in: [tabs/tabs-store.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/tabs/tabs-store.ts#L40)

The configuration, which follows the preferences.

---

### storageKey? \{#storagekey\}

```ts
readonly storageKey?: string;
```

Defined in: [tabs/tabs-store.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/tabs/tabs-store.ts#L44)

The storage key, defaulting to [TABS\_STORAGE\_KEY](../variables/TABS_STORAGE_KEY.md).

---

### storages \{#storages\}

```ts
readonly storages: object;
```

Defined in: [tabs/tabs-store.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/tabs/tabs-store.ts#L42)

The two persistence media.

#### local

```ts
readonly local: StorageLike;
```

#### session

```ts
readonly session: StorageLike;
```
