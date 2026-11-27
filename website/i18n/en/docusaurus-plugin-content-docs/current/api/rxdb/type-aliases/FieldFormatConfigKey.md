# FieldFormatConfigKey

```ts
type FieldFormatConfigKey =
  | 'colorSpace'
  | 'contentType'
  | 'currency'
  | 'display'
  | 'language'
  | 'max'
  | 'min'
  | 'scale'
  | 'schemes'
  | 'step'
  | 'timezone'
  | 'unit';
```

Defined in: [packages/rxdb/src/entity/metadata-validate.ts:121](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/metadata-validate.ts#L121)

The full set of `format` config keys (excluding `kind` itself).

## Remarks

Registration-time validation and the field-descriptor DTO parser share the same key dictionary: the former decides
"this kind must not have this key", the latter decides "this key is not part of the protocol, drop it". Two separate
copies would inevitably drift.
