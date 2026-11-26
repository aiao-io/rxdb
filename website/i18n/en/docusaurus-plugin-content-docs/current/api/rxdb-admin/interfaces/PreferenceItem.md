# PreferenceItem

Defined in: [preferences/schema/types.ts:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/schema/types.ts#L49)

A preference: corresponds to a leaf in the preferences tree (a dedicated control corresponds to its own subtree).

## Properties

### control \{#control\}

```ts
readonly control: PreferenceControl;
```

Defined in: [preferences/schema/types.ts:71](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/schema/types.ts#L71)

The control.

***

### enabledWhen? \{#enabledwhen\}

```ts
readonly enabledWhen?: (prefs) => boolean;
```

Defined in: [preferences/schema/types.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/schema/types.ts#L73)

The control is disabled when it returns `false`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `prefs` | [`AdminPreferences`](AdminPreferences.md) |

#### Returns

`boolean`

***

### hint? \{#hint\}

```ts
readonly hint?: string;
```

Defined in: [preferences/schema/types.ts:69](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/schema/types.ts#L69)

The literal description.

***

### hintKey? \{#hintkey\}

```ts
readonly hintKey?: string;
```

Defined in: [preferences/schema/types.ts:67](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/schema/types.ts#L67)

The description translation key.

***

### id \{#id\}

```ts
readonly id: string;
```

Defined in: [preferences/schema/types.ts:51](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/schema/types.ts#L51)

The unique identifier; for built-in items it equals `path`.

***

### label? \{#label\}

```ts
readonly label?: string;
```

Defined in: [preferences/schema/types.ts:65](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/schema/types.ts#L65)

The literal title, used when there is no `labelKey`.

***

### labelKey? \{#labelkey\}

```ts
readonly labelKey?: string;
```

Defined in: [preferences/schema/types.ts:63](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/schema/types.ts#L63)

The translation key, `prefs.item.<path>` by default.

***

### path \{#path\}

```ts
readonly path: string;
```

Defined in: [preferences/schema/types.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/schema/types.ts#L53)

The dotted path in the preferences tree.

***

### section \{#section\}

```ts
readonly section: string;
```

Defined in: [preferences/schema/types.ts:57](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/schema/types.ts#L57)

The group identifier; its translation key is `prefs.section.<section>`, extensions can use `sectionLabel` instead.

***

### sectionKey? \{#sectionkey\}

```ts
readonly sectionKey?: string;
```

Defined in: [preferences/schema/types.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/schema/types.ts#L61)

The group title translation key, taking precedence over the literal title.

***

### sectionLabel? \{#sectionlabel\}

```ts
readonly sectionLabel?: string;
```

Defined in: [preferences/schema/types.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/schema/types.ts#L59)

The group literal title (for extensions).

***

### tab \{#tab\}

```ts
readonly tab: PreferenceTab;
```

Defined in: [preferences/schema/types.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/schema/types.ts#L55)

The tab it belongs to.
