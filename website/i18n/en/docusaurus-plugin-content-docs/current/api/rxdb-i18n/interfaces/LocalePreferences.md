# LocalePreferences

Defined in: [locale.ts:2](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/locale.ts#L2)

The single data contract of the locale fallback chain, shared by UI and data translation.

## Properties

### defaultLocale \{#defaultlocale\}

```ts
defaultLocale: string;
```

Defined in: [locale.ts:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/locale.ts#L10)

Caller default locale: the UI application default locale, or the default content locale of data entities.

***

### deviceLocale \{#devicelocale\}

```ts
deviceLocale: string;
```

Defined in: [locale.ts:8](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/locale.ts#L8)

Host locale.

***

### devicePreferredLocale? \{#devicepreferredlocale\}

```ts
devicePreferredLocale?: string | null;
```

Defined in: [locale.ts:6](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/locale.ts#L6)

Locale explicitly chosen by the user on the current device.

***

### locale? \{#locale\}

```ts
locale?: string;
```

Defined in: [locale.ts:4](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/locale.ts#L4)

Explicitly requested locale.