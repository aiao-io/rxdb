# ModelI18n

Defined in: [packages/rxdb-model/src/i18n.ts:6](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/i18n.ts#L6)

Translation runtime consumed by the components.

## Properties

### changes$? \{#changes\}

```ts
readonly changes$?: Observable<unknown>;
```

Defined in: [packages/rxdb-model/src/i18n.ts:12](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/i18n.ts#L12)

Catalog and language change notifications.

## Methods

### formatDate()? \{#formatdate\}

```ts
formatDate?(value, options?): string;
```

Defined in: [packages/rxdb-model/src/i18n.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/i18n.ts#L14)

Format a date using the current language.

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

Defined in: [packages/rxdb-model/src/i18n.ts:16](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/i18n.ts#L16)

Format a number using the current language.

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

Defined in: [packages/rxdb-model/src/i18n.ts:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/i18n.ts#L10)

Check whether a message exists in the catalog without recording missing-entry diagnostics.

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

Defined in: [packages/rxdb-model/src/i18n.ts:8](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/i18n.ts#L8)

Resolve a message in the namespace.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | `string` |
| `params?` | `Record`&lt;`string`, `unknown`&gt; |
| `namespace?` | `string` |

#### Returns

`string`
