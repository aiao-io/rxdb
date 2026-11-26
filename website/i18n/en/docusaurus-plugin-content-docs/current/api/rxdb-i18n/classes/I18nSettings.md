# I18nSettings

Defined in: [entities.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/entities.ts#L19)

Language state of the current device; not synced across devices.

## Constructors

### Constructor

```ts
new I18nSettings(): I18nSettings;
```

#### Returns

`I18nSettings`

## Properties

### defaultLocale \{#defaultlocale\}

```ts
defaultLocale: string;
```

Defined in: [entities.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/entities.ts#L27)

Application default locale.

***

### deviceLocale \{#devicelocale\}

```ts
deviceLocale: string;
```

Defined in: [entities.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/entities.ts#L23)

Host-probed locale.

***

### devicePreferredLocale \{#devicepreferredlocale\}

```ts
devicePreferredLocale: string | null;
```

Defined in: [entities.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/entities.ts#L25)

Locale explicitly chosen by the user on this device.

***

### id \{#id\}

```ts
id: string;
```

Defined in: [entities.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/entities.ts#L21)

Fixed to singleton.

***

### updatedAt \{#updatedat\}

```ts
updatedAt: Date;
```

Defined in: [entities.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/entities.ts#L29)

Monotonically increasing local revision time, so reactive queries can detect preference changes.
