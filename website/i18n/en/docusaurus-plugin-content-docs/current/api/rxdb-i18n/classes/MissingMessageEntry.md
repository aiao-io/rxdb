# MissingMessageEntry

Defined in: [entities.ts:117](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/entities.ts#L117)

Local diagnostic row for missing keys.

## Constructors

### Constructor

```ts
new MissingMessageEntry(): MissingMessageEntry;
```

#### Returns

`MissingMessageEntry`

## Properties

### id \{#id\}

```ts
id: string;
```

Defined in: [entities.ts:119](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/entities.ts#L119)

Encoding of locale, namespace and key.

---

### key \{#key\}

```ts
key: string;
```

Defined in: [entities.ts:125](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/entities.ts#L125)

The missing key.

---

### locale \{#locale\}

```ts
locale: string;
```

Defined in: [entities.ts:121](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/entities.ts#L121)

Locale at the time of the miss.

---

### namespace \{#namespace\}

```ts
namespace: string;
```

Defined in: [entities.ts:123](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/entities.ts#L123)

Namespace.

---

### updatedAt \{#updatedat\}

```ts
updatedAt: Date;
```

Defined in: [entities.ts:127](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-i18n/src/entities.ts#L127)

Time of first observation.
