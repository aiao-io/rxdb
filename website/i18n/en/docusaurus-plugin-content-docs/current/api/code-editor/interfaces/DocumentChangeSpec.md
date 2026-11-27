# DocumentChangeSpec

Defined in: [document-sync.ts:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor/src/document-sync.ts#L20)

Range and content of a document replacement; fields are compatible with CodeMirror's `ChangeSpec`.

## Properties

### from \{#from\}

```ts
readonly from: number;
```

Defined in: [document-sync.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor/src/document-sync.ts#L22)

Replacement start (inclusive).

---

### insert \{#insert\}

```ts
readonly insert: string;
```

Defined in: [document-sync.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor/src/document-sync.ts#L26)

The text to insert.

---

### to \{#to\}

```ts
readonly to: number;
```

Defined in: [document-sync.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/code-editor/src/document-sync.ts#L24)

Replacement end (exclusive), in **pre-replacement** document coordinates.
