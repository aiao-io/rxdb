# ShortcutDefinition

Defined in: [shortcuts/registry.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shortcuts/registry.ts#L40)

The declaration of a shortcut.

## Properties

### allowInInput? \{#allowininput\}

```ts
readonly allowInInput?: boolean;
```

Defined in: [shortcuts/registry.ts:54](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shortcuts/registry.ts#L54)

Whether it responds inside an input field; by default combos containing Ctrl / Meta / Alt respond, plain character keys do not.

***

### combo \{#combo\}

```ts
readonly combo: string;
```

Defined in: [shortcuts/registry.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shortcuts/registry.ts#L44)

The key combo text, such as `Mod+K`.

***

### handler \{#handler\}

```ts
readonly handler: (event) => void;
```

Defined in: [shortcuts/registry.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shortcuts/registry.ts#L50)

Executed on a match.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `event` | [`KeyEventLike`](KeyEventLike.md) |

#### Returns

`void`

***

### id \{#id\}

```ts
readonly id: string;
```

Defined in: [shortcuts/registry.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shortcuts/registry.ts#L42)

The unique identifier, used for enabling / disabling and listing in the UI.

***

### label? \{#label\}

```ts
readonly label?: string;
```

Defined in: [shortcuts/registry.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shortcuts/registry.ts#L48)

The literal description, used when there is no `labelKey`.

***

### labelKey? \{#labelkey\}

```ts
readonly labelKey?: string;
```

Defined in: [shortcuts/registry.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shortcuts/registry.ts#L46)

The translation key of the description.

***

### when? \{#when\}

```ts
readonly when?: () => boolean;
```

Defined in: [shortcuts/registry.ts:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/shortcuts/registry.ts#L52)

When it returns `false` the shortcut does not respond this time (e.g. while the screen is locked).

#### Returns

`boolean`
