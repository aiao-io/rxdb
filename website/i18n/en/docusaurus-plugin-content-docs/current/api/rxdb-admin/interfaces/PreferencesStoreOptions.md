# PreferencesStoreOptions

Defined in: [preferences/store.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/store.ts#L44)

The construction options of [PreferencesStore](../classes/PreferencesStore.md).

## Properties

### constraints? \{#constraints\}

```ts
readonly constraints?: Readonly<Record<string, PreferenceConstraint>>;
```

Defined in: [preferences/store.ts:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/store.ts#L52)

Leaf value constraints, usually derived by `deriveConstraints`.

***

### debounceMs? \{#debouncems\}

```ts
readonly debounceMs?: number;
```

Defined in: [preferences/store.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/store.ts#L58)

The persistence debounce in milliseconds, 150 by default.

***

### defaults? \{#defaults\}

```ts
readonly defaults?: AdminPreferences;
```

Defined in: [preferences/store.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/store.ts#L50)

The application-level defaults tree, defaulting to [defaultPreferences](../variables/defaultPreferences.md).

***

### extensions? \{#extensions\}

```ts
readonly extensions?: readonly PreferenceExtension[];
```

Defined in: [preferences/store.ts:54](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/store.ts#L54)

Business extension preferences, whose defaults merge into the defaults tree.

***

### host? \{#host\}

```ts
readonly host?: PreferencesHost;
```

Defined in: [preferences/store.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/store.ts#L60)

The host event source: cross-tab sync and flushing to storage when the page hides; no listening by default.

***

### migrateLegacy? \{#migratelegacy\}

```ts
readonly migrateLegacy?: (storage) => 
  | DeepPartial<AdminPreferences>
  | null;
```

Defined in: [preferences/store.ts:56](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/store.ts#L56)

Reads the legacy version key on first use (when storage is empty) and returns the preference patch to merge in.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `storage` | [`StorageLike`](StorageLike.md) |

#### Returns

  \| [`DeepPartial`](../type-aliases/DeepPartial.md)&lt;[`AdminPreferences`](AdminPreferences.md)&gt;
  \| `null`

***

### storage \{#storage\}

```ts
readonly storage: StorageLike;
```

Defined in: [preferences/store.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/store.ts#L46)

The persistence medium.

***

### storageKey? \{#storagekey\}

```ts
readonly storageKey?: string;
```

Defined in: [preferences/store.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/store.ts#L48)

The storage key, defaulting to [PREFERENCES\_STORAGE\_KEY](../variables/PREFERENCES_STORAGE_KEY.md).
