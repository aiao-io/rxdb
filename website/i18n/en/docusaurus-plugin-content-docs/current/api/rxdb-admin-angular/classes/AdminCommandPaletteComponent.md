# AdminCommandPaletteComponent

Defined in: [rxdb-admin-angular/src/palette/command-palette.component.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/palette/command-palette.component.ts#L27)

Command palette: aggregates menus, commands and sources registered by the application (such as full-text search); keyboard up/down selection, Enter executes.
Rendered as a native modal `<dialog>`; the input is a combobox and the results are a listbox.

## Constructors

### Constructor

```ts
new AdminCommandPaletteComponent(): AdminCommandPaletteComponent;
```

Defined in: [rxdb-admin-angular/src/palette/command-palette.component.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/palette/command-palette.component.ts#L37)

#### Returns

`AdminCommandPaletteComponent`

## Properties

### Search \{#search\}

```ts
protected readonly Search: typeof LucideSearch = LucideSearch;
```

Defined in: [rxdb-admin-angular/src/palette/command-palette.component.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/palette/command-palette.component.ts#L35)

***

### shell \{#shell\}

```ts
protected readonly shell: AdminShell<LucideIconInput>;
```

Defined in: [rxdb-admin-angular/src/palette/command-palette.component.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/palette/command-palette.component.ts#L32)

***

### state \{#state\}

```ts
protected readonly state: Signal<PaletteState>;
```

Defined in: [rxdb-admin-angular/src/palette/command-palette.component.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/palette/command-palette.component.ts#L34)

***

### t \{#t\}

```ts
protected readonly t: (key, params?) => string;
```

Defined in: [rxdb-admin-angular/src/palette/command-palette.component.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/palette/command-palette.component.ts#L33)

Translates shell text.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `key` | `string` | Text key. |
| `params?` | `Record`&lt;`string`, `unknown`&gt; | ICU parameters. |

#### Returns

`string`

## Methods

### choose() \{#choose\}

```ts
protected choose(entry): void;
```

Defined in: [rxdb-admin-angular/src/palette/command-palette.component.ts:76](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/palette/command-palette.component.ts#L76)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `entry` | [`PaletteEntry`](../../rxdb-admin/interfaces/PaletteEntry.md) |

#### Returns

`void`

***

### close() \{#close\}

```ts
protected close(): void;
```

Defined in: [rxdb-admin-angular/src/palette/command-palette.component.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/palette/command-palette.component.ts#L44)

#### Returns

`void`

***

### groupLabel() \{#grouplabel\}

```ts
protected groupLabel(group): string | undefined;
```

Defined in: [rxdb-admin-angular/src/palette/command-palette.component.ts:68](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/palette/command-palette.component.ts#L68)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `group` | [`PaletteGroup`](../../rxdb-admin/interfaces/PaletteGroup.md) |

#### Returns

`string` \| `undefined`

***

### hover() \{#hover\}

```ts
protected hover(entry): void;
```

Defined in: [rxdb-admin-angular/src/palette/command-palette.component.ts:72](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/palette/command-palette.component.ts#L72)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `entry` | [`PaletteEntry`](../../rxdb-admin/interfaces/PaletteEntry.md) |

#### Returns

`void`

***

### iconOf() \{#iconof\}

```ts
protected iconOf(entry): LucideIconInput | undefined;
```

Defined in: [rxdb-admin-angular/src/palette/command-palette.component.ts:80](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/palette/command-palette.component.ts#L80)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `entry` | [`PaletteEntry`](../../rxdb-admin/interfaces/PaletteEntry.md) |

#### Returns

`LucideIconInput` \| `undefined`

***

### onBackdropClick() \{#onbackdropclick\}

```ts
protected onBackdropClick(event): void;
```

Defined in: [rxdb-admin-angular/src/palette/command-palette.component.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/palette/command-palette.component.ts#L48)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `event` | `MouseEvent` |

#### Returns

`void`

***

### onKeyDown() \{#onkeydown\}

```ts
protected onKeyDown(event): void;
```

Defined in: [rxdb-admin-angular/src/palette/command-palette.component.ts:56](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/palette/command-palette.component.ts#L56)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `event` | `KeyboardEvent` |

#### Returns

`void`

***

### onQuery() \{#onquery\}

```ts
protected onQuery(event): void;
```

Defined in: [rxdb-admin-angular/src/palette/command-palette.component.ts:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-angular/src/palette/command-palette.component.ts#L52)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `event` | `Event` |

#### Returns

`void`
