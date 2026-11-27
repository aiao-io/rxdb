# I18nBinding

Defined in: [rxdb-i18n-vue/src/use-i18n.ts:18](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n-vue/src/use-i18n.ts#L18)

The Vue native reactive i18n binding.

## Extends

- `Pick`&lt;[`I18n`](../../rxdb-i18n/classes/I18n.md),
  \| `"t"`
  \| `"resolve"`
  \| `"setLocale"`
  \| `"formatNumber"`
  \| `"formatDate"`
  \| `"formatRelativeTime"`&gt;

## Properties

### availableLocales \{#availablelocales\}

```ts
readonly availableLocales: ComputedRef<string[]>;
```

Defined in: [rxdb-i18n-vue/src/use-i18n.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n-vue/src/use-i18n.ts#L25)

The set of languages in the registered catalogs.

---

### formatDate \{#formatdate\}

```ts
formatDate: (value, options?) => string;
```

Defined in: rxdb-i18n/dist/i18n.d.ts:124

Formats a date in the current language.

#### Parameters

| Parameter  | Type                    | Description                           |
| ---------- | ----------------------- | ------------------------------------- |
| `value`    | `Date`                  | The date to display.                  |
| `options?` | `DateTimeFormatOptions` | Platform Intl.DateTimeFormat options. |

#### Returns

`string`

The localized date.

#### Inherited from

`Pick.formatDate`

---

### formatNumber \{#formatnumber\}

```ts
formatNumber: (value, options?) => string;
```

Defined in: rxdb-i18n/dist/i18n.d.ts:117

Formats a number in the current language.

#### Parameters

| Parameter  | Type                  | Description                         |
| ---------- | --------------------- | ----------------------------------- |
| `value`    | `number`              | The number to display.              |
| `options?` | `NumberFormatOptions` | Platform Intl.NumberFormat options. |

#### Returns

`string`

The localized number.

#### Inherited from

`Pick.formatNumber`

---

### formatRelativeTime \{#formatrelativetime\}

```ts
formatRelativeTime: (value, unit, options?) => string;
```

Defined in: rxdb-i18n/dist/i18n.d.ts:132

Formats a relative time in the current language.

#### Parameters

| Parameter  | Type                        | Description                               |
| ---------- | --------------------------- | ----------------------------------------- |
| `value`    | `number`                    | The amount relative to the current time.  |
| `unit`     | `RelativeTimeFormatUnit`    | The time unit.                            |
| `options?` | `RelativeTimeFormatOptions` | Platform Intl.RelativeTimeFormat options. |

#### Returns

`string`

The localized relative time.

#### Inherited from

`Pick.formatRelativeTime`

---

### locale \{#locale\}

```ts
readonly locale: Readonly<Ref<string>>;
```

Defined in: [rxdb-i18n-vue/src/use-i18n.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n-vue/src/use-i18n.ts#L23)

The currently active language.

---

### resolve \{#resolve\}

```ts
resolve: (key, namespace?) => ResolvedMessage;
```

Defined in: rxdb-i18n/dist/i18n.d.ts:101

Resolves the source copy and its origin along the shared fallback chain.

#### Parameters

| Parameter    | Type     | Description                                                           |
| ------------ | -------- | --------------------------------------------------------------------- |
| `key`        | `string` | The message key.                                                      |
| `namespace?` | `string` | The message namespace; the constructor options are used when omitted. |

#### Returns

[`ResolvedMessage`](../../rxdb-i18n/interfaces/ResolvedMessage.md)

The source copy of the first hit; value is undefined on a miss.

#### Inherited from

`Pick.resolve`

---

### setLocale \{#setlocale\}

```ts
setLocale: locale => Promise<void>;
```

Defined in: rxdb-i18n/dist/i18n.d.ts:66

Writes the user's language preference in a local transaction; updates the in-memory state immediately in library-less mode.

#### Parameters

| Parameter | Type     | Description                  |
| --------- | -------- | ---------------------------- |
| `locale`  | `string` | A valid BCP 47 language tag. |

#### Returns

`Promise`&lt;`void`&gt;

Completes when the current runtime has refreshed; other runtimes follow asynchronously via reactive queries.

#### Inherited from

`Pick.setLocale`

---

### t \{#t\}

```ts
t: (key, params?, namespace?) => string;
```

Defined in: rxdb-i18n/dist/i18n.d.ts:110

Formats an ICU message; returns the key and records a local diagnostic when the whole chain misses.

#### Parameters

| Parameter    | Type                                | Description                                                           |
| ------------ | ----------------------------------- | --------------------------------------------------------------------- |
| `key`        | `string`                            | The message key.                                                      |
| `params?`    | `Record`&lt;`string`, `unknown`&gt; | ICU interpolation, plural or select parameters.                       |
| `namespace?` | `string`                            | The message namespace; the constructor options are used when omitted. |

#### Returns

`string`

The plain-text formatting result.

#### Throws

Throws when ICU parameters are missing or the parameter value type is unsupported.

#### Inherited from

`Pick.t`
