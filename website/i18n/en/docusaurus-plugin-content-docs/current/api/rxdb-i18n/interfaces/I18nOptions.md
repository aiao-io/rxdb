# I18nOptions

Defined in: [i18n.ts:18](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/i18n.ts#L18)

Options of the client-side internationalization runtime.

## Properties

### catalogs? \{#catalogs\}

```ts
readonly catalogs?: readonly MessageCatalog[];
```

Defined in: [i18n.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/i18n.ts#L28)

Catalogs shipped with the application.

---

### defaultLocale? \{#defaultlocale\}

```ts
readonly defaultLocale?: string;
```

Defined in: [i18n.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/i18n.ts#L22)

Default locale, zh-Hans by default.

---

### deviceLocale? \{#devicelocale\}

```ts
readonly deviceLocale?: string;
```

Defined in: [i18n.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/i18n.ts#L24)

Host locale, navigator.language by default.

---

### locale? \{#locale\}

```ts
readonly locale?: string;
```

Defined in: [i18n.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/i18n.ts#L26)

Initial explicit locale; a persisted user preference takes precedence.

---

### namespace? \{#namespace\}

```ts
readonly namespace?: string;
```

Defined in: [i18n.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/i18n.ts#L30)

Default namespace of t(), app by default.

---

### rxdb? \{#rxdb\}

```ts
readonly rxdb?: RxDB;
```

Defined in: [i18n.ts:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/i18n.ts#L20)

Optional local database; when omitted, only static catalogs are used.
