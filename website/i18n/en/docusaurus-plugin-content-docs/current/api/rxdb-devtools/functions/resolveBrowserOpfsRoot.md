# resolveBrowserOpfsRoot()

```ts
function resolveBrowserOpfsRoot(): (() => Promise<FileSystemDirectoryHandle>) | undefined;
```

Defined in: [connector-providers.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-providers.ts#L60)

Detects whether this page has OPFS.

## Returns

(() => `Promise`&lt;`FileSystemDirectoryHandle`&gt;) \| `undefined`

The root directory entry point when OPFS is available, otherwise `undefined`.

## Remarks

This is not a "fall back to another storage when unavailable" escape hatch, but the **capability declaration** the descriptor model requires: without OPFS the `files` domain is not declared, so the panel dims the file page instead of lighting it up and then failing operation by operation.
