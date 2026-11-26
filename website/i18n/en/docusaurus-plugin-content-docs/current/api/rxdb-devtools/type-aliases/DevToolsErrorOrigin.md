# DevToolsErrorOrigin

```ts
type DevToolsErrorOrigin = "dom" | "node" | "rust";
```

Defined in: [v2/error-mapping.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/error-mapping.ts#L36)

The platform an error originates from.

## Remarks

Given explicitly by the caller, **no runtime sniffing**: the `name` of a Node error can happen to equal some
DOMException name, and sniffing would misclassify in that case — while the caller already knows for certain which side it runs on.
