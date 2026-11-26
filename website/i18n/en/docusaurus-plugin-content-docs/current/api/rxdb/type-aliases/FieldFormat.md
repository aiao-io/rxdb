# FieldFormat

```ts
type FieldFormat = 
  | ColorFormat
  | CodeFormat
  | CurrencyFormat
  | DateTimeFormat
  | DurationFormat
  | EmailFormat
  | MultilineTextFormat
  | MultiSelectFormat
  | NumberFormat
  | PercentageFormat
  | PhoneFormat
  | PlainTextFormat
  | RatingFormat
  | RichTextFormat
  | SingleSelectFormat
  | UrlFormat;
```

Defined in: [packages/rxdb/src/entity/cascade-options.interface.ts:143](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/cascade-options.interface.ts#L143)

Discriminated union of a field's business semantics and default rendering.

## Remarks

Declared only on concrete property interfaces; none of the four relation interfaces accept `format`.
