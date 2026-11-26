# FIELD_FORMAT_CARRIERS

```ts
const FIELD_FORMAT_CARRIERS: object;
```

Defined in: [packages/rxdb/src/entity/metadata-validate.ts:86](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/metadata-validate.ts#L86)

Single source of truth for the supported format kinds and their legal carrier PropertyTypes (shared with the AC#12 structure fixture).

## Type Declaration

### code \{#code\}

```ts
readonly code: readonly [string];
```

### color \{#color\}

```ts
readonly color: readonly [string];
```

### currency \{#currency\}

```ts
readonly currency: readonly [number];
```

### dateTime \{#datetime\}

```ts
readonly dateTime: readonly [date];
```

### duration \{#duration\}

```ts
readonly duration: readonly [number, integer];
```

### email \{#email\}

```ts
readonly email: readonly [string];
```

### multilineText \{#multilinetext\}

```ts
readonly multilineText: readonly [string];
```

### multiSelect \{#multiselect\}

```ts
readonly multiSelect: readonly [stringArray];
```

### number \{#number\}

```ts
readonly number: readonly [number, integer];
```

### percentage \{#percentage\}

```ts
readonly percentage: readonly [number];
```

### phone \{#phone\}

```ts
readonly phone: readonly [string];
```

### plainText \{#plaintext\}

```ts
readonly plainText: readonly [string];
```

### rating \{#rating\}

```ts
readonly rating: readonly [number, integer];
```

### richText \{#richtext\}

```ts
readonly richText: readonly [string];
```

### singleSelect \{#singleselect\}

```ts
readonly singleSelect: readonly [enum];
```

### url \{#url\}

```ts
readonly url: readonly [string];
```
