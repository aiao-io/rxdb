# I18nInspection

Defined in: [inspection.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/inspection.ts#L34)

Directly serializable inspection snapshot detached from runtime mutable state.

## Properties

### availableLocales \{#availablelocales\}

```ts
readonly availableLocales: readonly string[];
```

Defined in: [inspection.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/inspection.ts#L38)

Locales that have catalogs.

***

### locale \{#locale\}

```ts
readonly locale: string;
```

Defined in: [inspection.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/inspection.ts#L36)

Currently effective locale.

***

### messages \{#messages\}

```ts
readonly messages: readonly I18nInspectedMessage[];
```

Defined in: [inspection.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/inspection.ts#L40)

All catalog rows including overridden versions.

***

### missingMessages \{#missingmessages\}

```ts
readonly missingMessages: readonly I18nInspectedMissingMessage[];
```

Defined in: [inspection.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/inspection.ts#L42)

Missing keys after the queued diagnostic writes complete.