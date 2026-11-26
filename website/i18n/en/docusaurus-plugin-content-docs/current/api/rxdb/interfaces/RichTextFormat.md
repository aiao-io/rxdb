# RichTextFormat

Defined in: [packages/rxdb/src/entity/cascade-options.interface.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/cascade-options.interface.ts#L39)

Rich text.

## Remarks

The wire format must be `text/markdown` or `text/html`; using an editor's private JSON as a public protocol is forbidden.
This layer only passes through losslessly; it does no sanitization and makes no content safety promises.

## Properties

### contentType \{#contenttype\}

```ts
contentType: 'text/html' | 'text/markdown';
```

Defined in: [packages/rxdb/src/entity/cascade-options.interface.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/cascade-options.interface.ts#L41)

---

### kind \{#kind\}

```ts
kind: 'richText';
```

Defined in: [packages/rxdb/src/entity/cascade-options.interface.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/cascade-options.interface.ts#L40)
