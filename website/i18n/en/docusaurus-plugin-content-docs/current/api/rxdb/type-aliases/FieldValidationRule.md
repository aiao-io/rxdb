# FieldValidationRule

```ts
type FieldValidationRule =
  | 'date'
  | 'email'
  | 'enum'
  | 'integer'
  | 'json'
  | 'number'
  | 'numberArray'
  | 'phone'
  | 'range'
  | 'required'
  | 'stringArray'
  | 'type'
  | 'url'
  | 'urlScheme'
  | 'uuid';
```

Defined in: [packages/rxdb/src/entity/entity-value.utils.ts:304](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-value.utils.ts#L304)

The rule identifiers [validateFieldValue](../functions/validateFieldValue.md) may hit.

## Remarks

Adding members is a breaking change: callers usually exhaustively branch on this union. 15 members in total.
