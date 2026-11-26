# ShellTheme

Defined in: [shell/types.ts:79](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L79)

Theme control.

## Properties

### darkName \{#darkname\}

```ts
readonly darkName: string | undefined;
```

Defined in: [shell/types.ts:87](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L87)

The dark theme name used by the half-dark sidebar / top bar; `undefined` when the available themes have no dark theme.

---

### isDark \{#isdark\}

```ts
readonly isDark: ReadableStore<boolean>;
```

Defined in: [shell/types.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L85)

Whether it is currently dark.

---

### options \{#options\}

```ts
readonly options: readonly ThemeOption[];
```

Defined in: [shell/types.ts:81](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L81)

The available themes.

---

### resolved \{#resolved\}

```ts
readonly resolved: ReadableStore<string>;
```

Defined in: [shell/types.ts:83](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L83)

The resolved concrete theme name (`system` already resolved per the system's dark / light mode).

## Methods

### cycle() \{#cycle\}

```ts
cycle(): void;
```

Defined in: [shell/types.ts:94](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L94)

Cycles through system → light → dark.

#### Returns

`void`

---

### label() \{#label\}

```ts
label(name): string;
```

Defined in: [shell/types.ts:99](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L99)

The display name of a theme.

#### Parameters

| Parameter | Type     | Description                 |
| --------- | -------- | --------------------------- |
| `name`    | `string` | The theme name or `system`. |

#### Returns

`string`

---

### set() \{#set\}

```ts
set(name): void;
```

Defined in: [shell/types.ts:92](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L92)

Selects a theme.

#### Parameters

| Parameter | Type     | Description                 |
| --------- | -------- | --------------------------- |
| `name`    | `string` | The theme name or `system`. |

#### Returns

`void`
