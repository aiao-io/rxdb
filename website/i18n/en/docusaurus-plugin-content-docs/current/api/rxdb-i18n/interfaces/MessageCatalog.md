# MessageCatalog

Defined in: [catalog.ts:5](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/catalog.ts#L5)

A set of ICU source messages belonging to one locale and namespace.

## Properties

### locale \{#locale\}

```ts
readonly locale: string;
```

Defined in: [catalog.ts:7](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/catalog.ts#L7)

BCP 47 language tag.

***

### messages \{#messages\}

```ts
readonly messages: Readonly<Record<string, string>>;
```

Defined in: [catalog.ts:11](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/catalog.ts#L11)

Key to ICU source message; an empty string is valid.

***

### namespace \{#namespace\}

```ts
readonly namespace: string;
```

Defined in: [catalog.ts:9](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/catalog.ts#L9)

Application or component namespace.