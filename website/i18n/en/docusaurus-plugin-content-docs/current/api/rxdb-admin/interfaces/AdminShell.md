---
sidebar_label: 'AdminShell⟨TIcon⟩'
---

# AdminShell`<TIcon>`

Defined in: [shell/types.ts:103](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L103)

The admin shell runtime: aggregates preferences, theme, layout, tabs, shortcuts, the command palette, and the lock screen. All three framework bindings are thin wrappers around it.

## Type Parameters

| Type Parameter                            | Default type |
| ----------------------------------------- | ------------ |
| <a id="type-parameter-ticon"></a> `TIcon` | `unknown`    |

## Properties

### brandTitle \{#brandtitle\}

```ts
readonly brandTitle: string;
```

Defined in: [shell/types.ts:129](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L129)

The application brand name.

---

### breadcrumb \{#breadcrumb\}

```ts
readonly breadcrumb: ReadableStore<BreadcrumbItem<TIcon>[]>;
```

Defined in: [shell/types.ts:117](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L117)

The breadcrumb.

---

### currentUrl \{#currenturl\}

```ts
readonly currentUrl: ReadableStore<string>;
```

Defined in: [shell/types.ts:111](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L111)

The current URL.

---

### drawer \{#drawer\}

```ts
readonly drawer: ReadableStore<readonly DrawerTab[]>;
```

Defined in: [shell/types.ts:121](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L121)

The view model of the preferences drawer.

---

### fullscreen \{#fullscreen\}

```ts
readonly fullscreen: FullscreenController;
```

Defined in: [shell/types.ts:145](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L145)

The fullscreen.

---

### homeUrl \{#homeurl\}

```ts
readonly homeUrl: string;
```

Defined in: [shell/types.ts:131](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L131)

The home page URL.

---

### i18n \{#i18n\}

```ts
readonly i18n: I18n;
```

Defined in: [shell/types.ts:133](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L133)

The i18n runtime.

---

### isMobile \{#ismobile\}

```ts
readonly isMobile: ReadableStore<boolean>;
```

Defined in: [shell/types.ts:115](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L115)

The mobile width.

---

### layout \{#layout\}

```ts
readonly layout: ReadableStore<LayoutState>;
```

Defined in: [shell/types.ts:113](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L113)

The layout derived from preferences / viewport / menu.

---

### lock \{#lock\}

```ts
readonly lock: LockController;
```

Defined in: [shell/types.ts:143](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L143)

The lock screen.

---

### menu \{#menu\}

```ts
readonly menu: Store<readonly MenuNode<TIcon>[]>;
```

Defined in: [shell/types.ts:109](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L109)

The navigation menu.

---

### palette \{#palette\}

```ts
readonly palette: PaletteController;
```

Defined in: [shell/types.ts:141](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L141)

The command palette.

---

### preferences \{#preferences\}

```ts
readonly preferences: PreferencesStore;
```

Defined in: [shell/types.ts:105](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L105)

The preferences state tree.

---

### shortcuts \{#shortcuts\}

```ts
readonly shortcuts: ShortcutRegistry;
```

Defined in: [shell/types.ts:137](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L137)

The shortcut registry.

---

### tabs \{#tabs\}

```ts
readonly tabs: TabsStore;
```

Defined in: [shell/types.ts:139](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L139)

The tabs.

---

### text \{#text\}

```ts
readonly text: ReadableStore<number>;
```

Defined in: [shell/types.ts:127](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L127)

The copy revision number, incremented when the language or catalog changes; bindings re-render based on it.

---

### theme \{#theme\}

```ts
readonly theme: ShellTheme;
```

Defined in: [shell/types.ts:135](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L135)

The theme.

---

### timezone \{#timezone\}

```ts
readonly timezone: ReadableStore<string>;
```

Defined in: [shell/types.ts:125](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L125)

The effective timezone (IANA).

---

### ui \{#ui\}

```ts
readonly ui: ShellUi;
```

Defined in: [shell/types.ts:107](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L107)

The transient UI state and actions.

---

### watermark \{#watermark\}

```ts
readonly watermark: ReadableStore<string>;
```

Defined in: [shell/types.ts:123](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L123)

The CSS `background-image` value of the watermark; empty string when not enabled.

---

### widgets \{#widgets\}

```ts
readonly widgets: ReadableStore<WidgetKey[]>;
```

Defined in: [shell/types.ts:119](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L119)

The widgets visible on the top bar, in order.

## Methods

### activateTab() \{#activatetab\}

```ts
activateTab(key): void;
```

Defined in: [shell/types.ts:177](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L177)

Activates a tab (navigates to its URL).

#### Parameters

| Parameter | Type     | Description  |
| --------- | -------- | ------------ |
| `key`     | `string` | The tab key. |

#### Returns

`void`

---

### attach() \{#attach\}

```ts
attach(): () => void;
```

Defined in: [shell/types.ts:217](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L217)

Binds the browser: global shortcuts, root element theme / layout variables, dynamic title, language preference. Idempotent.

#### Returns

The unbind function.

() => `void`

---

### closeAllTabs() \{#closealltabs\}

```ts
closeAllTabs(): void;
```

Defined in: [shell/types.ts:199](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L199)

Closes all unpinned tabs.

#### Returns

`void`

---

### closeLeftTabs() \{#closelefttabs\}

```ts
closeLeftTabs(key): void;
```

Defined in: [shell/types.ts:192](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L192)

Closes the tabs to the left.

#### Parameters

| Parameter | Type     | Description            |
| --------- | -------- | ---------------------- |
| `key`     | `string` | The reference tab key. |

#### Returns

`void`

---

### closeOtherTabs() \{#closeothertabs\}

```ts
closeOtherTabs(key): void;
```

Defined in: [shell/types.ts:187](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L187)

Closes the other tabs.

#### Parameters

| Parameter | Type     | Description          |
| --------- | -------- | -------------------- |
| `key`     | `string` | The tab key to keep. |

#### Returns

`void`

---

### closeRightTabs() \{#closerighttabs\}

```ts
closeRightTabs(key): void;
```

Defined in: [shell/types.ts:197](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L197)

Closes the tabs to the right.

#### Parameters

| Parameter | Type     | Description            |
| --------- | -------- | ---------------------- |
| `key`     | `string` | The reference tab key. |

#### Returns

`void`

---

### closeTab() \{#closetab\}

```ts
closeTab(key): void;
```

Defined in: [shell/types.ts:182](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L182)

Closes a tab; closing the current tab navigates to the next one.

#### Parameters

| Parameter | Type     | Description  |
| --------- | -------- | ------------ |
| `key`     | `string` | The tab key. |

#### Returns

`void`

---

### destroy() \{#destroy\}

```ts
destroy(): void;
```

Defined in: [shell/types.ts:219](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L219)

Unbinds and releases listeners, flushes pending writes; closes the command palette, canceling its debounce and any in-flight search.

#### Returns

`void`

---

### formatDate() \{#formatdate\}

```ts
formatDate(date, options?): string;
```

Defined in: [shell/types.ts:212](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L212)

Formats a date in the selected timezone and language.

#### Parameters

| Parameter  | Type                    | Description                        |
| ---------- | ----------------------- | ---------------------------------- |
| `date`     | `Date`                  | The moment.                        |
| `options?` | `DateTimeFormatOptions` | The `Intl.DateTimeFormat` options. |

#### Returns

`string`

---

### navigate() \{#navigate\}

```ts
navigate(url): void;
```

Defined in: [shell/types.ts:161](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L161)

Navigates to a URL (via `options.navigate`).

#### Parameters

| Parameter | Type     | Description     |
| --------- | -------- | --------------- |
| `url`     | `string` | The target URL. |

#### Returns

`void`

---

### openTabInNewWindow() \{#opentabinnewwindow\}

```ts
openTabInNewWindow(key): void;
```

Defined in: [shell/types.ts:204](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L204)

Opens a tab in a new window.

#### Parameters

| Parameter | Type     | Description  |
| --------- | -------- | ------------ |
| `key`     | `string` | The tab key. |

#### Returns

`void`

---

### registerCommand() \{#registercommand\}

```ts
registerCommand(command): () => void;
```

Defined in: [shell/types.ts:172](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L172)

Registers a command palette command.

#### Parameters

| Parameter | Type                              | Description  |
| --------- | --------------------------------- | ------------ |
| `command` | [`ShellCommand`](ShellCommand.md) | The command. |

#### Returns

The unregister function.

() => `void`

---

### setMenu() \{#setmenu\}

```ts
setMenu(nodes): void;
```

Defined in: [shell/types.ts:166](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L166)

Updates the navigation menu (after a language switch or entity registration change).

#### Parameters

| Parameter | Type                                                | Description    |
| --------- | --------------------------------------------------- | -------------- |
| `nodes`   | readonly [`MenuNode`](MenuNode.md)&lt;`TIcon`&gt;[] | The menu tree. |

#### Returns

`void`

---

### syncRoute() \{#syncroute\}

```ts
syncRoute(url): void;
```

Defined in: [shell/types.ts:156](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L156)

Called after a route change: syncs the current URL, opens the tab, collapses the mobile drawer.

#### Parameters

| Parameter | Type     | Description      |
| --------- | -------- | ---------------- |
| `url`     | `string` | The current URL. |

#### Returns

`void`

---

### t() \{#t\}

```ts
t(key, params?): string;
```

Defined in: [shell/types.ts:151](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L151)

Translates shell copy.

#### Parameters

| Parameter | Type                                | Description         |
| --------- | ----------------------------------- | ------------------- |
| `key`     | `string`                            | The copy key.       |
| `params?` | `Record`&lt;`string`, `unknown`&gt; | The ICU parameters. |

#### Returns

`string`

---

### toggleSidebar() \{#togglesidebar\}

```ts
toggleSidebar(): void;
```

Defined in: [shell/types.ts:206](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shell/types.ts#L206)

Collapses / expands the sidebar (opens / closes the drawer on mobile).

#### Returns

`void`
