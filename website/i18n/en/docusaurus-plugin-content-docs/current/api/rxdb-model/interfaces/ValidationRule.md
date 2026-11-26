# ValidationRule

Defined in: [packages/rxdb-model/src/query-builder/models/validation.interface.ts:8](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/models/validation.interface.ts#L8)

A validation rule.

## Properties

### appliesTo? \{#appliesto\}

```ts
appliesTo?: PropertyType[];
```

Defined in: [packages/rxdb-model/src/query-builder/models/validation.interface.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/models/validation.interface.ts#L17)

The field types this rule applies to (optional; undefined means it applies to all types).

***

### message \{#message\}

```ts
message: string;
```

Defined in: [packages/rxdb-model/src/query-builder/models/validation.interface.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/models/validation.interface.ts#L22)

The error message.

***

### messageKey? \{#messagekey\}

```ts
messageKey?: string;
```

Defined in: [packages/rxdb-model/src/query-builder/models/validation.interface.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/models/validation.interface.ts#L25)

Key in the built-in copy catalog.

***

### name \{#name\}

```ts
name: string;
```

Defined in: [packages/rxdb-model/src/query-builder/models/validation.interface.ts:12](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/models/validation.interface.ts#L12)

The name of the rule.

***

### validate \{#validate\}

```ts
validate: (context) => boolean;
```

Defined in: [packages/rxdb-model/src/query-builder/models/validation.interface.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/models/validation.interface.ts#L31)

The validation function.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `context` | [`ValidationContext`](ValidationContext.md) |

#### Returns

`boolean`

true means passed, false means failed.
