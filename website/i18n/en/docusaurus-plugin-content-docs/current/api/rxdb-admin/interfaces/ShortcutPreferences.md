# ShortcutPreferences

Defined in: [shortcuts/registry.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shortcuts/registry.ts#L14)

The minimal contract the shortcut registry reads from and writes to preferences, which `PreferencesStore` naturally satisfies.

## Extends

- [`ReadableStore`](ReadableStore.md)&lt;[`AdminPreferences`](AdminPreferences.md)&gt;

## Properties

### changes$ \{#changes\}

```ts
readonly changes$: Observable<AdminPreferences>;
```

Defined in: [store.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/store.ts#L14)

An observable that replays the current value and pushes subsequent changes.

#### Inherited from

[`ReadableStore`](ReadableStore.md).[`changes$`](ReadableStore.md#changes)

---

### value \{#value\}

```ts
readonly value: AdminPreferences;
```

Defined in: [store.ts:12](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/store.ts#L12)

The synchronous snapshot of the current value.

#### Inherited from

[`ReadableStore`](ReadableStore.md).[`value`](ReadableStore.md#value)

## Methods

### setPath() \{#setpath\}

```ts
setPath(path, value): void;
```

Defined in: [shortcuts/registry.ts:16](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shortcuts/registry.ts#L16)

Writes a preference by dotted path.

#### Parameters

| Parameter | Type      |
| --------- | --------- |
| `path`    | `string`  |
| `value`   | `unknown` |

#### Returns

`void`

---

### subscribe() \{#subscribe\}

```ts
subscribe(listener): () => void;
```

Defined in: [store.ts:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/store.ts#L20)

Subscribes to subsequent changes without replaying the current value.

#### Parameters

| Parameter  | Type                | Description          |
| ---------- | ------------------- | -------------------- |
| `listener` | (`value`) => `void` | The change callback. |

#### Returns

The unsubscribe function.

() => `void`

#### Inherited from

[`ReadableStore`](ReadableStore.md).[`subscribe`](ReadableStore.md#subscribe)
