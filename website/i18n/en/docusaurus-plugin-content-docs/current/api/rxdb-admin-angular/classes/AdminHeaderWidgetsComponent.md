# AdminHeaderWidgetsComponent

Defined in: [rxdb-admin-angular/src/widgets/header-widgets.component.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/widgets/header-widgets.component.ts#L28)

Header widget area: renders the search, theme, language, timezone, fullscreen, refresh, lock screen and settings entries in the preference order with the preference visibility.

## Constructors

### Constructor

```ts
new AdminHeaderWidgetsComponent(): AdminHeaderWidgetsComponent;
```

#### Returns

`AdminHeaderWidgetsComponent`

## Properties

### fullscreen \{#fullscreen\}

```ts
protected readonly fullscreen: Signal<boolean>;
```

Defined in: [rxdb-admin-angular/src/widgets/header-widgets.component.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/widgets/header-widgets.component.ts#L35)

---

### fullscreenUnsupported \{#fullscreenunsupported\}

```ts
protected readonly fullscreenUnsupported: Signal<boolean>;
```

Defined in: [rxdb-admin-angular/src/widgets/header-widgets.component.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/widgets/header-widgets.component.ts#L36)

---

### hasDiff \{#hasdiff\}

```ts
protected readonly hasDiff: Signal<boolean>;
```

Defined in: [rxdb-admin-angular/src/widgets/header-widgets.component.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/widgets/header-widgets.component.ts#L37)

---

### isDark \{#isdark\}

```ts
protected readonly isDark: Signal<boolean>;
```

Defined in: [rxdb-admin-angular/src/widgets/header-widgets.component.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/widgets/header-widgets.component.ts#L34)

---

### keys \{#keys\}

```ts
protected readonly keys: Signal<WidgetKey[]>;
```

Defined in: [rxdb-admin-angular/src/widgets/header-widgets.component.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/widgets/header-widgets.component.ts#L31)

---

### LockKeyhole \{#lockkeyhole\}

```ts
protected readonly LockKeyhole: typeof LucideLockKeyhole = LucideLockKeyhole;
```

Defined in: [rxdb-admin-angular/src/widgets/header-widgets.component.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/widgets/header-widgets.component.ts#L59)

---

### Maximize2 \{#maximize2\}

```ts
protected readonly Maximize2: typeof LucideMaximize2 = LucideMaximize2;
```

Defined in: [rxdb-admin-angular/src/widgets/header-widgets.component.ts:56](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/widgets/header-widgets.component.ts#L56)

---

### Minimize2 \{#minimize2\}

```ts
protected readonly Minimize2: typeof LucideMinimize2 = LucideMinimize2;
```

Defined in: [rxdb-admin-angular/src/widgets/header-widgets.component.ts:57](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/widgets/header-widgets.component.ts#L57)

---

### prefs \{#prefs\}

```ts
protected readonly prefs: Signal<AdminPreferences>;
```

Defined in: [rxdb-admin-angular/src/widgets/header-widgets.component.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/widgets/header-widgets.component.ts#L33)

---

### RotateCw \{#rotatecw\}

```ts
protected readonly RotateCw: typeof LucideRotateCw = LucideRotateCw;
```

Defined in: [rxdb-admin-angular/src/widgets/header-widgets.component.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/widgets/header-widgets.component.ts#L58)

---

### Search \{#search\}

```ts
protected readonly Search: typeof LucideSearch = LucideSearch;
```

Defined in: [rxdb-admin-angular/src/widgets/header-widgets.component.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/widgets/header-widgets.component.ts#L55)

---

### searchKeys \{#searchkeys\}

```ts
protected readonly searchKeys: Signal<string[]>;
```

Defined in: [rxdb-admin-angular/src/widgets/header-widgets.component.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/widgets/header-widgets.component.ts#L39)

Key caps shown on the search button; empty when shortcuts are turned off.

---

### searchLabel \{#searchlabel\}

```ts
protected readonly searchLabel: Signal<string>;
```

Defined in: [rxdb-admin-angular/src/widgets/header-widgets.component.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/widgets/header-widgets.component.ts#L44)

The accessible name must contain all visible text on the button (including key caps), otherwise voice-control users cannot call out the button name (WCAG 2.5.3).

---

### Settings2 \{#settings2\}

```ts
protected readonly Settings2: typeof LucideSettings2 = LucideSettings2;
```

Defined in: [rxdb-admin-angular/src/widgets/header-widgets.component.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/widgets/header-widgets.component.ts#L60)

---

### shell \{#shell\}

```ts
protected readonly shell: AdminShell<LucideIconInput>;
```

Defined in: [rxdb-admin-angular/src/widgets/header-widgets.component.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/widgets/header-widgets.component.ts#L29)

---

### shortcuts \{#shortcuts\}

```ts
protected readonly shortcuts: Signal<readonly ShortcutInfo[]>;
```

Defined in: [rxdb-admin-angular/src/widgets/header-widgets.component.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/widgets/header-widgets.component.ts#L32)

---

### t \{#t\}

```ts
protected readonly t: (key, params?) => string;
```

Defined in: [rxdb-admin-angular/src/widgets/header-widgets.component.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/widgets/header-widgets.component.ts#L30)

Translates shell text.

#### Parameters

| Parameter | Type                                | Description     |
| --------- | ----------------------------------- | --------------- |
| `key`     | `string`                            | Text key.       |
| `params?` | `Record`&lt;`string`, `unknown`&gt; | ICU parameters. |

#### Returns

`string`

---

### themeIcon \{#themeicon\}

```ts
protected readonly themeIcon: Signal<
  | typeof LucideMonitor
  | typeof LucideSun
  | typeof LucideMoon
  | typeof LucidePalette>;
```

Defined in: [rxdb-admin-angular/src/widgets/header-widgets.component.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/widgets/header-widgets.component.ts#L48)

---

### themeLabel \{#themelabel\}

```ts
protected readonly themeLabel: Signal<string>;
```

Defined in: [rxdb-admin-angular/src/widgets/header-widgets.component.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/widgets/header-widgets.component.ts#L45)
