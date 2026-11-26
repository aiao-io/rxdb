# PreferencesStore

Defined in: [preferences/store.ts:82](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/store.ts#L82)

Preferences state tree: deep-merge updates, constraint-based sanitization, debounced diff persistence, cross-tab sync.

## Remarks

Only the diff against the defaults is stored, so when a later release adjusts defaults,
users who never changed a value follow automatically.
All writes (UI, imports, other tabs) go through the same sanitization, so the state tree is always valid.

## Implements

- [`ReadableStore`](../interfaces/ReadableStore.md)&lt;[`AdminPreferences`](../interfaces/AdminPreferences.md)&gt;

## Constructors

### Constructor

```ts
new PreferencesStore(options): PreferencesStore;
```

Defined in: [preferences/store.ts:113](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/store.ts#L113)

Creates the preferences store and synchronously loads saved preferences.

#### Parameters

| Parameter | Type                                                                  | Description                                     |
| --------- | --------------------------------------------------------------------- | ----------------------------------------------- |
| `options` | [`PreferencesStoreOptions`](../interfaces/PreferencesStoreOptions.md) | Storage, defaults, constraints, and extensions. |

#### Returns

`PreferencesStore`

#### Throws

Throws when an extension declaration is invalid or a key is duplicated.

## Properties

### defaults \{#defaults\}

```ts
readonly defaults: AdminPreferences;
```

Defined in: [preferences/store.ts:94](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/store.ts#L94)

The effective default tree (app defaults + extension defaults).

---

### hasDiff \{#hasdiff\}

```ts
readonly hasDiff: ReadableStore<boolean>;
```

Defined in: [preferences/store.ts:96](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/store.ts#L96)

Whether there are changes relative to the defaults; drives the "Reset" red dot.

## Accessors

### changes$ \{#changes\}

#### Get Signature

```ts
get changes$(): Observable<AdminPreferences>;
```

Defined in: [preferences/store.ts:104](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/store.ts#L104)

Replays the current preferences and pushes subsequent changes.

##### Returns

`Observable`&lt;[`AdminPreferences`](../interfaces/AdminPreferences.md)&gt;

An observable that replays the current value and pushes subsequent changes.

#### Implementation of

[`ReadableStore`](../interfaces/ReadableStore.md).[`changes$`](../interfaces/ReadableStore.md#changes)

---

### value \{#value\}

#### Get Signature

```ts
get value(): AdminPreferences;
```

Defined in: [preferences/store.ts:99](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/store.ts#L99)

Synchronous snapshot of the current preferences.

##### Returns

[`AdminPreferences`](../interfaces/AdminPreferences.md)

Synchronous snapshot of the current value.

#### Implementation of

[`ReadableStore`](../interfaces/ReadableStore.md).[`value`](../interfaces/ReadableStore.md#value)

## Methods

### destroy() \{#destroy\}

```ts
destroy(): void;
```

Defined in: [preferences/store.ts:207](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/store.ts#L207)

Flushes to storage and removes host listeners.

#### Returns

`void`

---

### diff() \{#diff\}

```ts
diff():
  | DeepPartial<AdminPreferences>
  | null;
```

Defined in: [preferences/store.ts:170](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/store.ts#L170)

The diff against the defaults.

#### Returns

\| [`DeepPartial`](../type-aliases/DeepPartial.md)&lt;[`AdminPreferences`](../interfaces/AdminPreferences.md)&gt;
\| `null`

The diff; `null` when there is no diff.

---

### exportJson() \{#exportjson\}

```ts
exportJson(): string;
```

Defined in: [preferences/store.ts:178](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/store.ts#L178)

Exports a copyable / shareable preferences config.

#### Returns

`string`

The diff JSON against the defaults; `{}` when there is no diff.

---

### flush() \{#flush\}

```ts
flush(): void;
```

Defined in: [preferences/store.ts:196](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/store.ts#L196)

Immediately flushes pending writes to storage; writes nothing when this instance has no unsaved changes (so a stale state never overwrites values another tab just wrote).

#### Returns

`void`

---

### importJson() \{#importjson\}

```ts
importJson(json): ImportResult;
```

Defined in: [preferences/store.ts:187](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/store.ts#L187)

Imports a preferences config: replaces the current preferences (relative to the defaults) wholesale with the exported content; invalid values fall back to defaults through sanitization.

#### Parameters

| Parameter | Type     | Description                                 |
| --------- | -------- | ------------------------------------------- |
| `json`    | `string` | Text produced by [exportJson](#exportjson). |

#### Returns

[`ImportResult`](../type-aliases/ImportResult.md)

Success, or the failure reason; on failure the current preferences are unchanged.

---

### reset() \{#reset\}

```ts
reset(): void;
```

Defined in: [preferences/store.ts:162](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/store.ts#L162)

Returns to the default tree and clears the saved diff.

#### Returns

`void`

---

### setPath() \{#setpath\}

```ts
setPath(path, value): void;
```

Defined in: [preferences/store.ts:157](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/store.ts#L157)

Writes a single value at a dot-separated path.

#### Parameters

| Parameter | Type      | Description                                 |
| --------- | --------- | ------------------------------------------- |
| `path`    | `string`  | Preference path, e.g. `theme.colorPrimary`. |
| `value`   | `unknown` | The new value.                              |

#### Returns

`void`

---

### subscribe() \{#subscribe\}

```ts
subscribe(listener): () => void;
```

Defined in: [preferences/store.ts:140](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/store.ts#L140)

Subscribes to subsequent changes.

#### Parameters

| Parameter  | Type                | Description      |
| ---------- | ------------------- | ---------------- |
| `listener` | (`value`) => `void` | Change callback. |

#### Returns

An unsubscribe function.

() => `void`

#### Implementation of

[`ReadableStore`](../interfaces/ReadableStore.md).[`subscribe`](../interfaces/ReadableStore.md#subscribe)

---

### update() \{#update\}

```ts
update(patch): void;
```

Defined in: [preferences/store.ts:148](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/store.ts#L148)

Deep-merge patch, committed after sanitization and persisted with debouncing.

#### Parameters

| Parameter | Type                                                                                                           | Description                                      |
| --------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `patch`   | [`DeepPartial`](../type-aliases/DeepPartial.md)&lt;[`AdminPreferences`](../interfaces/AdminPreferences.md)&gt; | Preference patch; arrays are replaced wholesale. |

#### Returns

`void`
