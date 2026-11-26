# RemoteMessageEntry

Defined in: [entities.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/entities.ts#L85)

Remote catalog cache, kept in a separate table from MessageEntry to isolate QueryCache orphan cleanup.

## Implements

- [`MessageEntry`](MessageEntry.md)

## Constructors

### Constructor

```ts
new RemoteMessageEntry(): RemoteMessageEntry;
```

#### Returns

`RemoteMessageEntry`

## Properties

### id \{#id\}

```ts
id: string;
```

Defined in: [entities.ts:87](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/entities.ts#L87)

Deterministic JSON encoding of locale, namespace and key.

#### Implementation of

[`MessageEntry`](MessageEntry.md).[`id`](MessageEntry.md#id)

---

### key \{#key\}

```ts
key: string;
```

Defined in: [entities.ts:93](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/entities.ts#L93)

Message key.

#### Implementation of

[`MessageEntry`](MessageEntry.md).[`key`](MessageEntry.md#key)

---

### locale \{#locale\}

```ts
locale: string;
```

Defined in: [entities.ts:89](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/entities.ts#L89)

Canonicalized locale.

#### Implementation of

[`MessageEntry`](MessageEntry.md).[`locale`](MessageEntry.md#locale)

---

### namespace \{#namespace\}

```ts
namespace: string;
```

Defined in: [entities.ts:91](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/entities.ts#L91)

Namespace.

#### Implementation of

[`MessageEntry`](MessageEntry.md).[`namespace`](MessageEntry.md#namespace)

---

### source \{#source\}

```ts
source: MessageSource;
```

Defined in: [entities.ts:97](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/entities.ts#L97)

Source marker of the remote cache.

#### Implementation of

[`MessageEntry`](MessageEntry.md).[`source`](MessageEntry.md#source)

---

### updatedAt \{#updatedat\}

```ts
updatedAt: Date;
```

Defined in: [entities.ts:99](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/entities.ts#L99)

Most recent update time.

#### Implementation of

[`MessageEntry`](MessageEntry.md).[`updatedAt`](MessageEntry.md#updatedat)

---

### value \{#value\}

```ts
value: string;
```

Defined in: [entities.ts:95](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/entities.ts#L95)

ICU source message.

#### Implementation of

[`MessageEntry`](MessageEntry.md).[`value`](MessageEntry.md#value)
