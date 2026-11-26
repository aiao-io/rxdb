# AdminPreferencesDrawerComponent

Defined in: [rxdb-admin-angular/src/preferences/preferences-drawer.component.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/preferences/preferences-drawer.component.ts#L22)

Preferences drawer: five tabs driven by the schema, with reset / copy / import configuration in the footer.
Rendered as a native modal `<dialog>`; focus trap, Esc and backdrop inertness are handled by the browser.

## Constructors

### Constructor

```ts
new AdminPreferencesDrawerComponent(): AdminPreferencesDrawerComponent;
```

Defined in: [rxdb-admin-angular/src/preferences/preferences-drawer.component.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/preferences/preferences-drawer.component.ts#L36)

#### Returns

`AdminPreferencesDrawerComponent`

## Properties

### active \{#active\}

```ts
protected readonly active: WritableSignal<PreferenceTab>;
```

Defined in: [rxdb-admin-angular/src/preferences/preferences-drawer.component.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/preferences/preferences-drawer.component.ts#L30)

---

### copyState \{#copystate\}

```ts
protected readonly copyState: WritableSignal<"copy" | "copied" | "copyFailed">;
```

Defined in: [rxdb-admin-angular/src/preferences/preferences-drawer.component.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/preferences/preferences-drawer.component.ts#L32)

---

### current \{#current\}

```ts
protected readonly current: Signal<DrawerTab>;
```

Defined in: [rxdb-admin-angular/src/preferences/preferences-drawer.component.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/preferences/preferences-drawer.component.ts#L33)

---

### hasDiff \{#hasdiff\}

```ts
protected readonly hasDiff: Signal<boolean>;
```

Defined in: [rxdb-admin-angular/src/preferences/preferences-drawer.component.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/preferences/preferences-drawer.component.ts#L29)

---

### importing \{#importing\}

```ts
protected readonly importing: WritableSignal<boolean>;
```

Defined in: [rxdb-admin-angular/src/preferences/preferences-drawer.component.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/preferences/preferences-drawer.component.ts#L31)

---

### shell \{#shell\}

```ts
protected readonly shell: AdminShell<LucideIconInput>;
```

Defined in: [rxdb-admin-angular/src/preferences/preferences-drawer.component.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/preferences/preferences-drawer.component.ts#L25)

---

### t \{#t\}

```ts
protected readonly t: (key, params?) => string;
```

Defined in: [rxdb-admin-angular/src/preferences/preferences-drawer.component.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/preferences/preferences-drawer.component.ts#L26)

Translates shell text.

#### Parameters

| Parameter | Type                                | Description     |
| --------- | ----------------------------------- | --------------- |
| `key`     | `string`                            | Text key.       |
| `params?` | `Record`&lt;`string`, `unknown`&gt; | ICU parameters. |

#### Returns

`string`

---

### tabs \{#tabs\}

```ts
protected readonly tabs: Signal<readonly DrawerTab[]>;
```

Defined in: [rxdb-admin-angular/src/preferences/preferences-drawer.component.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/preferences/preferences-drawer.component.ts#L28)

---

### ui \{#ui\}

```ts
protected readonly ui: Signal<ShellUiState>;
```

Defined in: [rxdb-admin-angular/src/preferences/preferences-drawer.component.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/preferences/preferences-drawer.component.ts#L27)

---

### X \{#x\}

```ts
protected readonly X: typeof LucideX = LucideX;
```

Defined in: [rxdb-admin-angular/src/preferences/preferences-drawer.component.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/preferences/preferences-drawer.component.ts#L34)

## Methods

### close() \{#close\}

```ts
protected close(): void;
```

Defined in: [rxdb-admin-angular/src/preferences/preferences-drawer.component.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/preferences/preferences-drawer.component.ts#L40)

#### Returns

`void`

---

### copy() \{#copy\}

```ts
protected copy(): Promise<void>;
```

Defined in: [rxdb-admin-angular/src/preferences/preferences-drawer.component.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/preferences/preferences-drawer.component.ts#L58)

#### Returns

`Promise`&lt;`void`&gt;

---

### isLabelled() \{#islabelled\}

```ts
protected isLabelled(row): boolean;
```

Defined in: [rxdb-admin-angular/src/preferences/preferences-drawer.component.ts:54](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/preferences/preferences-drawer.component.ts#L54)

The widget and shortcut lists come with their own labels for each item; the settings row itself renders no title.

#### Parameters

| Parameter | Type                                                    |
| --------- | ------------------------------------------------------- |
| `row`     | [`DrawerRow`](../../rxdb-admin/interfaces/DrawerRow.md) |

#### Returns

`boolean`

---

### isStacked() \{#isstacked\}

```ts
protected isStacked(row): boolean;
```

Defined in: [rxdb-admin-angular/src/preferences/preferences-drawer.component.ts:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/preferences/preferences-drawer.component.ts#L49)

Settings rows where the title and control each take their own line (control below the title).

#### Parameters

| Parameter | Type                                                    |
| --------- | ------------------------------------------------------- |
| `row`     | [`DrawerRow`](../../rxdb-admin/interfaces/DrawerRow.md) |

#### Returns

`boolean`

---

### onBackdropClick() \{#onbackdropclick\}

```ts
protected onBackdropClick(event): void;
```

Defined in: [rxdb-admin-angular/src/preferences/preferences-drawer.component.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/preferences/preferences-drawer.component.ts#L44)

#### Parameters

| Parameter | Type         |
| --------- | ------------ |
| `event`   | `MouseEvent` |

#### Returns

`void`
