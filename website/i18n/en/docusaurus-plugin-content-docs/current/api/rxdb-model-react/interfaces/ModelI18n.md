# ModelI18n

Defined in: packages/rxdb-model/dist/i18n.d.ts:4

Translation runtime consumed by the components.

## Properties

### changes$? \{#changes\}

```ts
readonly changes$?: Observable<unknown>;
```

Defined in: packages/rxdb-model/dist/i18n.d.ts:12

Catalog and language change notifications.

## Methods

### formatDate()? \{#formatdate\}

```ts
formatDate?(value, options?): string;
```

Defined in: packages/rxdb-model/dist/i18n.d.ts:14

Formats a date using the current language.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `value` | `Date` |
| `options?` | `DateTimeFormatOptions` |

#### Returns

`string`

***

### formatNumber()? \{#formatnumber\}

```ts
formatNumber?(value, options?): string;
```

Defined in: packages/rxdb-model/dist/i18n.d.ts:16

Formats a number using the current language.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `value` | `number` |
| `options?` | `NumberFormatOptions` |

#### Returns

`string`

***

### resolve()? \{#resolve\}

```ts
resolve?(key, namespace?): object;
```

Defined in: packages/rxdb-model/dist/i18n.d.ts:8

Checks whether the message exists in the catalog without recording missing diagnostics.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | `string` |
| `namespace?` | `string` |

#### Returns

`object`

##### value?

```ts
readonly value?: string;
```

***

### t() \{#t\}

```ts
t(
   key, 
   params?, 
   namespace?
): string;
```

Defined in: packages/rxdb-model/dist/i18n.d.ts:6

Resolves a message in a namespace.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | `string` |
| `params?` | `Record`&lt;`string`, `unknown`&gt; |
| `namespace?` | `string` |

#### Returns

`string`
