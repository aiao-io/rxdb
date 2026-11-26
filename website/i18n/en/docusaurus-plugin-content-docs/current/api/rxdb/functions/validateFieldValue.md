# validateFieldValue()

```ts
function validateFieldValue(descriptor, value): FieldValidationError | null;
```

Defined in: [packages/rxdb/src/entity/entity-value.utils.ts:673](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-value.utils.ts#L673)

Validates a single field value against an [EntityFieldDescriptor](../type-aliases/EntityFieldDescriptor.md).

## Parameters

| Parameter    | Type                                                                | Description                                                                           |
| ------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `descriptor` | [`EntityFieldDescriptor`](../type-aliases/EntityFieldDescriptor.md) | The field descriptor from `describeEntityFields()` or `parseEntityFieldsDescriptor()` |
| `value`      | `unknown`                                                           | The value to validate                                                                 |

## Returns

[`FieldValidationError`](../interfaces/FieldValidationError.md) \| `null`

Returns `null` on success, otherwise a [FieldValidationError](../interfaces/FieldValidationError.md).

## Remarks

A pure function: it does not query the database, construct repositories, or resolve entity metadata — it looks only at the descriptor and the value itself. The validation order is required → type → enum member → format value semantics; the first failing stage short-circuits and returns, without accumulating multiple errors.

This function coexists with [validateEntityFieldValue](validateEntityFieldValue.md) and their behavior is **deliberately not aligned**: the new function, per the "no fallback" rule, accepts only native types — `'3.14'` is not a legal `number`, and `'2026-01-01'` or a millisecond timestamp is not a legal `date` (`date` accepts only `Date` instances, the same caliber as `bigint` / `binary`); the old function's `Number()` coercion and `new Date(value)` implicit parsing stay frozen.

## Throws

Throws `TypeError` when `valueType` or `format.kind` is outside the closed set.

## Example

```ts
const fields = describeEntityFields(Article);
const homepage = fields.fields.find(item => item.field === 'homepage')!;
validateFieldValue(homepage, 'ftp://example.com');
// → `{ field: 'homepage', message: 'The protocol of homepage is not in the allowed range: ftp', rule: 'urlScheme', value: 'ftp://example.com' }`
```
