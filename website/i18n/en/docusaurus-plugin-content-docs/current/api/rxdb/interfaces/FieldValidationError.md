# FieldValidationError

Defined in: [packages/rxdb/src/entity/entity-value.utils.ts:234](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-value.utils.ts#L234)

The description of a failed field value validation.

## Remarks

`rule` and `value` are only produced by [validateFieldValue](../functions/validateFieldValue.md); the frozen
[validateEntityFieldValue](../functions/validateEntityFieldValue.md) always returns only the two keys `field` and `message`.

## Properties

### field \{#field\}

```ts
field: string;
```

Defined in: [packages/rxdb/src/entity/entity-value.utils.ts:236](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-value.utils.ts#L236)

The physical name of the field

***

### message \{#message\}

```ts
message: string;
```

Defined in: [packages/rxdb/src/entity/entity-value.utils.ts:238](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-value.utils.ts#L238)

The user-facing error text

***

### rule? \{#rule\}

```ts
rule?: FieldValidationRule;
```

Defined in: [packages/rxdb/src/entity/entity-value.utils.ts:240](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-value.utils.ts#L240)

The identifier of the rule hit, for programmatic branching by callers

***

### value? \{#value\}

```ts
value?: JsonValue;
```

Defined in: [packages/rxdb/src/entity/entity-value.utils.ts:242](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-value.utils.ts#L242)

The value that triggered the failure, normalized into JSON-safe form; the key is absent when it cannot be safely converted or the field is encrypted
