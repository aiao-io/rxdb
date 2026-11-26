---
sidebar_label: 'AdminShellOptions⟨TIcon⟩'
---

# AdminShellOptions`<TIcon>`

Defined in: [shell/types.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L27)

The options for creating the shell.

## Type Parameters

| Type Parameter                            | Default type |
| ----------------------------------------- | ------------ |
| <a id="type-parameter-ticon"></a> `TIcon` | `unknown`    |

## Properties

### brand? \{#brand\}

```ts
readonly brand?: object;
```

Defined in: [shell/types.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L37)

The brand: the application name used in the sidebar / top bar, the dynamic title, and the default watermark copy.

#### documentTitleKey?

```ts
readonly documentTitleKey?: string;
```

The document title translation key in the application runtime's default namespace.

#### title

```ts
readonly title: string;
```

#### titleKey?

```ts
readonly titleKey?: string;
```

The brand translation key in the application runtime's default namespace.

---

### defaults? \{#defaults\}

```ts
readonly defaults?: DeepPartial<AdminPreferences>;
```

Defined in: [shell/types.ts:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L49)

The application-level default preferences, overriding the in-package defaults.

---

### extensions? \{#extensions\}

```ts
readonly extensions?: readonly PreferenceExtension[];
```

Defined in: [shell/types.ts:51](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L51)

The business extension preferences, shown in the "Extensions" tab.

---

### homeUrl? \{#homeurl\}

```ts
readonly homeUrl?: string;
```

Defined in: [shell/types.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L35)

The home page URL: go back here after the last tab is closed, `/` by default.

---

### host? \{#host\}

```ts
readonly host?: ShellHost;
```

Defined in: [shell/types.ts:63](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L63)

The host object, taking the globals by default.

---

### i18n? \{#i18n\}

```ts
readonly i18n?: I18n;
```

Defined in: [shell/types.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L45)

The application's own i18n runtime; `adminMessages` needs to be added to its `catalogs`. Defaults to a static runtime containing only the shell catalog (Chinese).

---

### initialUrl? \{#initialurl\}

```ts
readonly initialUrl?: string;
```

Defined in: [shell/types.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L33)

The initial URL, `window.location.pathname` by default.

---

### lockHasher? \{#lockhasher\}

```ts
readonly lockHasher?: PasswordHasher;
```

Defined in: [shell/types.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L61)

The lock screen password hashing, PBKDF2-SHA256 (Web Crypto) by default.

---

### menu? \{#menu\}

```ts
readonly menu?: readonly MenuNode<TIcon>[];
```

Defined in: [shell/types.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L31)

The initial navigation menu, later updated via [AdminShell.setMenu](AdminShell.md#setmenu).

---

### migrateLegacy? \{#migratelegacy\}

```ts
readonly migrateLegacy?: (storage) =>
  | DeepPartial<AdminPreferences>
  | null;
```

Defined in: [shell/types.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L53)

Migrates preferences from the legacy storage key on first use.

#### Parameters

| Parameter | Type                            |
| --------- | ------------------------------- |
| `storage` | [`StorageLike`](StorageLike.md) |

#### Returns

\| [`DeepPartial`](../type-aliases/DeepPartial.md)&lt;[`AdminPreferences`](AdminPreferences.md)&gt;
\| `null`

---

### mobileBreakpoint? \{#mobilebreakpoint\}

```ts
readonly mobileBreakpoint?: number;
```

Defined in: [shell/types.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L59)

The mobile breakpoint (px), 768 by default.

---

### navigate \{#navigate\}

```ts
readonly navigate: (url) => void;
```

Defined in: [shell/types.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L29)

The route navigation; the shell itself is router-agnostic.

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `url`     | `string` |

#### Returns

`void`

---

### storage? \{#storage\}

```ts
readonly storage?: object;
```

Defined in: [shell/types.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L55)

The persistence media, `localStorage` / `sessionStorage` by default.

#### local?

```ts
readonly local?: StorageLike;
```

#### session?

```ts
readonly session?: StorageLike;
```

---

### storagePrefix? \{#storageprefix\}

```ts
readonly storagePrefix?: string;
```

Defined in: [shell/types.ts:57](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L57)

The storage key prefix, used for isolation when multiple apps share an origin, `aiao.admin` by default.

---

### themes? \{#themes\}

```ts
readonly themes?: readonly ThemeOption[];
```

Defined in: [shell/types.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L47)

The available themes; must match the daisyUI themes enabled in the styles, `light` / `dark` by default.
