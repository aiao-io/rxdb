# MessageEntry

Defined in: [entities.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/entities.ts#L50)

Local persistent override row, never cleaned by the remote catalog.

## Constructors

### Constructor

```ts
new MessageEntry(): MessageEntry;
```

#### Returns

`MessageEntry`

## Properties

### id \{#id\}

```ts
id: string;
```

Defined in: [entities.ts:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/entities.ts#L52)

Deterministic JSON encoding of locale, namespace and key.

***

### key \{#key\}

```ts
key: string;
```

Defined in: [entities.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/entities.ts#L58)

Message key.

***

### locale \{#locale\}

```ts
locale: string;
```

Defined in: [entities.ts:54](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/entities.ts#L54)

Canonicalized locale.

***

### namespace \{#namespace\}

```ts
namespace: string;
```

Defined in: [entities.ts:56](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/entities.ts#L56)

Namespace.

***

### source \{#source\}

```ts
source: MessageSource;
```

Defined in: [entities.ts:62](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/entities.ts#L62)

Source marker of the local override.

***

### updatedAt \{#updatedat\}

```ts
updatedAt: Date;
```

Defined in: [entities.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/entities.ts#L64)

Most recent update time.

***

### value \{#value\}

```ts
value: string;
```

Defined in: [entities.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/entities.ts#L60)

ICU source message.
