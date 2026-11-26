# DrawerModelInput

Defined in: [preferences/drawer-model.ts:84](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/drawer-model.ts#L84)

The input of [buildDrawerModel](../functions/buildDrawerModel.md).

## Properties

### items \{#items\}

```ts
readonly items: readonly PreferenceItem[];
```

Defined in: [preferences/drawer-model.ts:88](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/drawer-model.ts#L88)

The preference items (built-in + extensions).

***

### prefs \{#prefs\}

```ts
readonly prefs: AdminPreferences;
```

Defined in: [preferences/drawer-model.ts:86](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/drawer-model.ts#L86)

The current preferences.

***

### sources \{#sources\}

```ts
readonly sources: Readonly<Record<PreferenceOptionSource, readonly PreferenceOption[]>>;
```

Defined in: [preferences/drawer-model.ts:92](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/drawer-model.ts#L92)

Option sources that can only be determined at runtime.

***

### translate \{#translate\}

```ts
readonly translate: (key) => string;
```

Defined in: [preferences/drawer-model.ts:90](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/drawer-model.ts#L90)

The translation function.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | `string` |

#### Returns

`string`

***

### write \{#write\}

```ts
readonly write: (path, value) => void;
```

Defined in: [preferences/drawer-model.ts:94](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/drawer-model.ts#L94)

Writes a preference.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `path` | `string` |
| `value` | `unknown` |

#### Returns

`void`
