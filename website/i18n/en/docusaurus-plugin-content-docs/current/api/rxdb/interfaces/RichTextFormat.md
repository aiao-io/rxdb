# RichTextFormat

Defined in: [packages/rxdb/src/entity/cascade-options.interface.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/cascade-options.interface.ts#L39)

Rich text.

## Remarks

The communication format must be `text/markdown` or `text/html`; an editor's private JSON must not be used as a
public protocol. This layer only passes it through losslessly — no sanitization and no content-safety guarantee.

## Properties

### contentType \{#contenttype\}

```ts
contentType: "text/html" | "text/markdown";
```

Defined in: [packages/rxdb/src/entity/cascade-options.interface.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/cascade-options.interface.ts#L41)

***

### kind \{#kind\}

```ts
kind: "richText";
```

Defined in: [packages/rxdb/src/entity/cascade-options.interface.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/cascade-options.interface.ts#L40)
